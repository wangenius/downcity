/**
 * `city agent chat` 命令实现。
 *
 * 关键点（中文）
 * - 统一覆盖交互式持续对话与一次性消息模式，不再保留独立 `quest` 命令。
 * - 目标 agent 始终按 managed agent registry 名称解析，不依赖当前工作目录。
 * - 默认使用独立 local-cli 主会话：`local-cli-chat-main`。
 */

import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import prompts from "prompts";
import type { AgentSessionEvent } from "@downcity/agent";
import { emitCliBlock } from "../shared/CliReporter.js";
import { printResult } from "@/utils/cli/CliOutput.js";
import {
  resolveProjectRootByAgentName,
  validateAgentProjectRoot,
} from "../service/ServiceCommandSupport.js";
import { listRegisteredAgentsForCli } from "./AgentSelection.js";
import {
  formatCliBearerHeaderValue,
  resolveCliAuthToken,
} from "@/http/auth/CliAuthStateStore.js";
import { resolveDaemonEndpoint } from "@/process/daemon/Client.js";
import type {
  AgentChatCliOptions,
  AgentChatExecutionOutcome,
  AgentChatExecuteResponse,
  AgentChatTransportOptions,
} from "./AgentChatTypes.js";
import { AGENT_CHAT_DEFAULT_SESSION_ID } from "./AgentChatTypes.js";

const SDK_EVENTS_READY_TYPE = "sdk-events-ready";

type ResolvedAgentChatTarget = {
  /**
   * 目标 agent 名称。
   */
  agentName: string;
  /**
   * 目标项目根目录。
   */
  projectRoot: string;
  /**
   * 当前 chat 绑定的 sessionId。
   */
  sessionId: string;
};

function normalizeChatMessage(input: string): string {
  return String(input || "").trim();
}

/**
 * 判断 readline 在交互期间抛出的 Ctrl+C 中断是否属于正常退出。
 */
function isReadlineAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code || "") : "";
  const name = "name" in error ? String(error.name || "") : "";
  return code === "ABORT_ERR" || name === "AbortError";
}

function buildAgentChatFailureText(error?: string): string {
  return (
    String(error || "").trim() ||
    "Agent daemon returned empty error (check config with `city agent status`)"
  );
}

async function resolveChatTargetAgentName(inputName?: string): Promise<string | null> {
  const explicit = String(inputName || "").trim();
  if (explicit) return explicit;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emitCliBlock({
      tone: "error",
      title: "Agent name is required",
      note: "Use `city agent chat --to <agentName>` or run this command in an interactive terminal.",
    });
    return null;
  }

  const runningAgents = (await listRegisteredAgentsForCli()).filter(
    (item) => item.status === "running",
  );
  if (runningAgents.length === 0) {
    emitCliBlock({
      tone: "error",
      title: "No running agents",
      note: "Run `city agent start` first.",
    });
    return null;
  }

  const response = (await prompts({
    type: "select",
    name: "agentName",
    message: "选择要聊天的 Agent",
    choices: runningAgents.map((agent) => ({
      title: agent.name,
      description: agent.projectRoot,
      value: agent.name,
    })),
    initial: 0,
  })) as { agentName?: string };
  const agentName = String(response.agentName || "").trim();
  if (!agentName) {
    emitCliBlock({
      tone: "info",
      title: "Agent chat cancelled",
    });
    return null;
  }
  return agentName;
}

async function resolveAgentChatTarget(
  agentNameInput: string,
): Promise<
  | {
      success: true;
      target: ResolvedAgentChatTarget;
    }
  | {
      success: false;
      outcome: AgentChatExecutionOutcome;
    }
> {
  const agentName = String(agentNameInput || "").trim();
  const sessionId = AGENT_CHAT_DEFAULT_SESSION_ID;
  if (!agentName) {
    return {
      success: false,
      outcome: {
        agentName: "",
        sessionId,
        success: false,
        error: "Missing target agent name.",
      },
    };
  }

  const resolved = await resolveProjectRootByAgentName(agentName);
  if (!resolved.projectRoot) {
    return {
      success: false,
      outcome: {
        agentName,
        sessionId,
        success: false,
        error: resolved.error || "Failed to resolve agent project path",
      },
    };
  }

  const pathError = validateAgentProjectRoot(resolved.projectRoot);
  if (pathError) {
    return {
      success: false,
      outcome: {
        agentName,
        projectRoot: resolved.projectRoot,
        sessionId,
        success: false,
        error: pathError,
      },
    };
  }

  return {
    success: true,
    target: {
      agentName,
      projectRoot: resolved.projectRoot,
      sessionId,
    },
  };
}

function printAssistantReply(replyText: string): void {
  const text = String(replyText || "").trim();
  if (!text) {
    emitCliBlock({
      tone: "info",
      title: "No visible reply",
      note: "The turn completed, but no user-visible text was returned.",
    });
    return;
  }
  console.log(`\n${text}\n`);
}

function printAgentChatFailure(params: {
  agentName: string;
  error?: string;
}): void {
  emitCliBlock({
    tone: "error",
    title: "Agent chat failed",
    facts: [
      {
        label: "agent",
        value: params.agentName,
      },
      {
        label: "error",
        value: buildAgentChatFailureText(params.error),
      },
    ],
  });
}

async function readHttpFailure(response: Response): Promise<string> {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const text = await response.text().catch(() => "");
  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(text) as {
        error?: string;
        message?: string;
      };
      return (
        String(payload.error || payload.message || "").trim() ||
        `HTTP ${response.status}`
      );
    } catch {
      // ignore malformed json payloads
    }
  }
  return String(text || "").trim() || `HTTP ${response.status}`;
}

function isSdkEventsReadyFrame(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    String((value as { type?: unknown }).type || "") === SDK_EVENTS_READY_TYPE
  );
}

async function postSdkPrompt(params: {
  endpointBaseUrl: string;
  sessionId: string;
  message: string;
  authHeaderValue?: string;
}): Promise<
  | {
      success: true;
      turnId: string;
    }
  | {
      success: false;
      error: string;
    }
> {
  const response = await fetch(
    new URL(
      `/api/sdk/sessions/${encodeURIComponent(params.sessionId)}/prompt`,
      params.endpointBaseUrl,
    ).toString(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(params.authHeaderValue ? { Authorization: params.authHeaderValue } : {}),
      },
      body: JSON.stringify({
        query: params.message,
      }),
    },
  ).catch((error) => {
    throw new Error(`Failed to call ${params.endpointBaseUrl}: ${String(error)}`);
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    turn?: {
      id?: string;
    };
  };
  const turnId = String(payload.turn?.id || "").trim();
  if (!response.ok || payload.success !== true || !turnId) {
    return {
      success: false,
      error:
        String(payload.error || "").trim() ||
        `SDK prompt failed with HTTP ${response.status}`,
    };
  }
  return {
    success: true,
    turnId,
  };
}

async function runSdkPromptTurn(params: {
  agentName: string;
  message: string;
  transport?: AgentChatTransportOptions;
  renderText?: boolean;
}): Promise<{
  success: boolean;
  error?: string;
  emittedVisibleText: boolean;
  text?: string;
}> {
  const message = normalizeChatMessage(params.message);
  if (!message) {
    return {
      success: false,
      error: "Chat message is required.",
      emittedVisibleText: false,
      text: "",
    };
  }

  const resolved = await resolveAgentChatTarget(params.agentName);
  if (!resolved.success) {
    return {
      success: false,
      error: resolved.outcome.error,
      emittedVisibleText: false,
      text: "",
    };
  }

  const { target } = resolved;
  const abortController = new AbortController();
  const endpoint = resolveDaemonEndpoint({
    projectRoot: target.projectRoot,
    host: params.transport?.host,
    port: params.transport?.port,
  });
  const authHeaderValue = formatCliBearerHeaderValue(
    resolveCliAuthToken({
      explicitToken: params.transport?.token,
    }),
  );
  const response = await fetch(
    new URL(
      `/api/sdk/sessions/${encodeURIComponent(target.sessionId)}/events`,
      endpoint.baseUrl,
    ).toString(),
    {
      headers: {
        ...(authHeaderValue ? { Authorization: authHeaderValue } : {}),
      },
      signal: abortController.signal,
    },
  ).catch((error) => {
    throw new Error(`Failed to call ${endpoint.baseUrl}: ${String(error)}`);
  });

  if (!response.ok || !response.body) {
    return {
      success: false,
      error: await readHttpFailure(response),
      emittedVisibleText: false,
      text: "",
    };
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffered = "";
  let printedLeadingNewline = false;
  let emittedVisibleText = false;
  let promptTurnId = "";
  let promptPosted = false;
  let finalText = "";

  const renderEvent = (event: AgentSessionEvent): void => {
    if (event.type !== "text-delta" || event.turnId !== promptTurnId || !event.text) return;
    if (params.renderText === false) return;
    if (!printedLeadingNewline) {
      process.stdout.write("\n");
      printedLeadingNewline = true;
    }
    process.stdout.write(event.text);
    emittedVisibleText = true;
  };

  const handleLine = async (line: string): Promise<
    | {
        done: true;
        error?: string;
      }
    | {
        done: false;
      }
  > => {
    const value = JSON.parse(line) as unknown;
    if (isSdkEventsReadyFrame(value)) {
      if (!promptPosted) {
        promptPosted = true;
        const promptResult = await postSdkPrompt({
          endpointBaseUrl: endpoint.baseUrl,
          sessionId: target.sessionId,
          message,
          authHeaderValue,
        });
        if (!promptResult.success) {
          return {
            done: true,
            error: promptResult.error,
          };
        }
        promptTurnId = promptResult.turnId;
      }
      return { done: false };
    }

    const event = value as AgentSessionEvent;
    if (event.type === "error") {
      return {
        done: true,
        error: event.message,
      };
    }
    renderEvent(event);
    if (event.type === "turn-finish" && event.turnId === promptTurnId) {
      finalText = event.text;
      return {
        done: true,
        ...(event.success ? {} : { error: event.error || "Agent turn failed" }),
      };
    }
    return { done: false };
  };

  const finishTurn = (result: {
    success: boolean;
    error?: string;
  }): {
    success: boolean;
    error?: string;
    emittedVisibleText: boolean;
    text: string;
  } => {
    if (printedLeadingNewline) {
      process.stdout.write("\n\n");
    }
    return {
      success: result.success,
      ...(result.error ? { error: result.error } : {}),
      emittedVisibleText,
      text: finalText,
    };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newlineIndex = buffered.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex).trim();
        buffered = buffered.slice(newlineIndex + 1);
        if (line) {
          const result = await handleLine(line);
          if (result.done) {
            return finishTurn({
              success: !result.error,
              ...(result.error ? { error: result.error } : {}),
            });
          }
        }
        newlineIndex = buffered.indexOf("\n");
      }
    }

    const tail = buffered.trim();
    if (tail) {
      const result = await handleLine(tail);
      if (result.done) {
        return finishTurn({
          success: !result.error,
          ...(result.error ? { error: result.error } : {}),
        });
      }
    }
  } catch (error) {
    return finishTurn({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    abortController.abort();
    await reader.cancel().catch(() => undefined);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  return finishTurn({
    success: promptPosted && Boolean(promptTurnId),
    ...(promptPosted && promptTurnId ? {} : { error: "SDK events connection closed before prompt was accepted." }),
  });
}

/**
 * 向目标 agent 的 SDK actor session 发送一轮消息。
 */
export async function executeAgentChatTurn(params: {
  agentName: string;
  message: string;
  transport?: AgentChatTransportOptions;
}): Promise<AgentChatExecutionOutcome> {
  const message = normalizeChatMessage(params.message);
  const sessionId = AGENT_CHAT_DEFAULT_SESSION_ID;

  if (!message) {
    return {
      agentName: String(params.agentName || "").trim(),
      sessionId,
      success: false,
      error: "Chat message is required.",
    };
  }

  const resolved = await resolveAgentChatTarget(params.agentName);
  if (!resolved.success) return resolved.outcome;

  const outcome = await runSdkPromptTurn({
    agentName: params.agentName,
    message,
    transport: params.transport,
    renderText: false,
  });

  return {
    agentName: params.agentName,
    ...(resolved.target.projectRoot ? { projectRoot: resolved.target.projectRoot } : {}),
    sessionId,
    success: outcome.success,
    payload: {
      success: outcome.success,
      sessionId,
      result: {
        success: outcome.success,
        userVisible: outcome.text || "",
        ...(outcome.error ? { error: outcome.error } : {}),
      },
      ...(outcome.error ? { error: outcome.error } : {}),
    },
    ...(outcome.error ? { error: outcome.error } : {}),
  };
}

async function runOneShotChat(params: {
  agentName: string;
  message: string;
  options: AgentChatCliOptions;
}): Promise<void> {
  if (params.options.json === true) {
    const outcome = await executeAgentChatTurn({
      agentName: params.agentName,
      message: params.message,
      transport: {
        host: params.options.host,
        port: params.options.port,
        token: params.options.token,
      },
    });
    printResult({
      asJson: true,
      success: outcome.success,
      title: "agent chat",
      payload: {
        agent: params.agentName,
        ...(outcome.projectRoot ? { projectRoot: outcome.projectRoot } : {}),
        sessionId: outcome.sessionId,
        ...(outcome.payload?.result ? { result: outcome.payload.result } : {}),
        ...(outcome.error ? { error: outcome.error } : {}),
      },
    });
    return;
  }

  const outcome = await runSdkPromptTurn({
    agentName: params.agentName,
    message: params.message,
    transport: {
      host: params.options.host,
      port: params.options.port,
      token: params.options.token,
    },
  });

  if (!outcome.success) {
    printAgentChatFailure({
      agentName: params.agentName,
      error: outcome.error,
    });
    return;
  }

  if (!outcome.emittedVisibleText) printAssistantReply("");
}

/**
 * 启动交互式持续对话。
 */
async function runInteractiveChat(params: {
  agentName: string;
  options: AgentChatCliOptions;
}): Promise<void> {
  const prompt = `${chalk.cyan(params.agentName)} ${chalk.dim("›")} `;
  const helpText = [
    `${chalk.dim("/exit, /quit  — 退出对话")}`,
    `${chalk.dim("/clear       — 清屏")}`,
    `${chalk.dim("/help        — 显示此帮助")}`,
    `${chalk.dim("Ctrl+C       — 退出对话")}`,
  ];

  emitCliBlock({
    tone: "info",
    title: `Agent chat · ${params.agentName}`,
    note: `Session: local-cli-chat-main · ${helpText[0].replace(chalk.dim(""), "").trim()}`,
  });
  console.log(helpText.join("\n"));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  try {
    while (true) {
      let line = "";
      try {
        line = await rl.question(prompt);
      } catch (error) {
        // 关键点（中文）：Node 24 下 Ctrl+C 会让 readline.question 以 AbortError 拒绝。
        // 这里按正常退出处理，避免把交互式 chat 变成未捕获异常。
        if (isReadlineAbortError(error)) {
          console.log();
          break;
        }
        throw error;
      }
      const text = normalizeChatMessage(line);
      if (!text) continue;
      if (text === "/exit" || text === "/quit") break;
      if (text === "/clear") {
        console.clear();
        continue;
      }
      if (text === "/help") {
        console.log(helpText.join("\n"));
        continue;
      }

      const outcome = await runSdkPromptTurn({
        agentName: params.agentName,
        message: text,
        transport: {
          host: params.options.host,
          port: params.options.port,
          token: params.options.token,
        },
      });

      if (!outcome.success) {
        printAgentChatFailure({
          agentName: params.agentName,
          error: outcome.error,
        });
        continue;
      }

      if (!outcome.emittedVisibleText) printAssistantReply("");
    }
  } finally {
    rl.close();
  }
  console.log(chalk.dim("Chat ended."));
}

/**
 * `city agent chat` 统一入口。
 */
export async function chatCommand(options: AgentChatCliOptions): Promise<void> {
  const agentName = await resolveChatTargetAgentName(options.to);
  if (!agentName) return;

  const oneShotMessage = normalizeChatMessage(String(options.message || ""));
  if (oneShotMessage) {
    await runOneShotChat({
      agentName,
      message: oneShotMessage,
      options,
    });
    return;
  }

  if (options.json === true) {
    emitCliBlock({
      tone: "error",
      title: "JSON mode requires --message",
      note: "Use `city agent chat --message <text> --json` for one-shot structured output.",
    });
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emitCliBlock({
      tone: "error",
      title: "Interactive terminal required",
      note: "Use this command in a local terminal with TTY support, or pass `--message` for one-shot mode.",
    });
    return;
  }

  await runInteractiveChat({
    agentName,
    options,
  });
}
