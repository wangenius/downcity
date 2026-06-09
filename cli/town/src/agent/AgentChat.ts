/**
 * `town agent chat` 命令实现。
 *
 * 关键点（中文）
 * - 统一覆盖交互式持续对话与一次性消息模式，不再保留独立 `quest` 命令。
 * - 目标 agent 始终按 managed agent registry 名称解析，不依赖当前工作目录。
 * - 默认使用独立 local-cli 主会话：`local-cli-chat-main`。
 * - 远程访问统一走 `RemoteAgent({ url })`，不再在 CLI 侧维护第二套 HTTP SDK transport。
 */

import chalk from "chalk";
import prompts from "../tui/Prompts.js";
import {
  RemoteAgent,
  type AgentSessionEvent,
  type RemoteAgentSession,
} from "@downcity/agent";
import { emitCliBlock } from "../shared/CliReporter.js";
import { printResult } from "../utils/cli/CliOutput.js";
import {
  resolveProjectRootByAgentId,
  validateAgentProjectRoot,
} from "../shared/PluginTargetSupport.js";
import { listRegisteredAgentsForCli } from "./AgentSelection.js";
import { resolveDaemonRpcEndpoint } from "../process/daemon/Client.js";
import type {
  AgentChatCliOptions,
  AgentChatExecutionOutcome,
  AgentChatTransportOptions,
} from "./AgentChatTypes.js";
import { AGENT_CHAT_DEFAULT_SESSION_ID } from "./AgentChatTypes.js";
import { AgentChatInteractiveRenderer } from "./AgentChatInteractiveRenderer.js";
import { run_agent_chat_tui } from "./AgentChatTui.js";
import type { AgentChatInteractiveRendererPort } from "../types/AgentChatInteractive.js";

type ResolvedAgentChatTarget = {
  /**
   * 目标 agent id。
   */
  agentId: string;
  /**
   * 目标项目根目录。
   */
  projectRoot: string;
  /**
   * 当前 chat 绑定的 sessionId。
   */
  sessionId: string;
};

type AgentChatRemoteTarget = {
  /**
   * 远端访问 URL。
   */
  url: string;
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
    "Agent daemon returned empty error (check config with `town agent status`)"
  );
}

async function resolveChatTargetAgentId(inputId?: string): Promise<string | null> {
  const explicit = String(inputId || "").trim();
  if (explicit) return explicit;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emitCliBlock({
      tone: "error",
      title: "Agent id is required",
      note: "Use `town agent chat --to <id>` or run this command in an interactive terminal.",
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
      note: "Run `town agent start` first.",
    });
    return null;
  }

  const response = (await prompts({
    type: "select",
    name: "agentId",
    message: "选择要聊天的 Agent",
    choices: runningAgents.map((agent) => ({
      title: agent.id,
      description: agent.projectRoot,
      value: agent.id,
    })),
    initial: 0,
  })) as { agentId?: string };
  const agentId = String(response.agentId || "").trim();
  if (!agentId) {
    emitCliBlock({
      tone: "info",
      title: "Agent chat cancelled",
    });
    return null;
  }
  return agentId;
}

async function resolveAgentChatTarget(
  agentIdInput: string,
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
  const agentId = String(agentIdInput || "").trim();
  const sessionId = AGENT_CHAT_DEFAULT_SESSION_ID;
  if (!agentId) {
    return {
      success: false,
      outcome: {
        agentId: "",
        sessionId,
        success: false,
        error: "Missing target agent id.",
      },
    };
  }

  const resolved = await resolveProjectRootByAgentId(agentId);
  if (!resolved.projectRoot) {
    return {
      success: false,
      outcome: {
        agentId,
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
        agentId,
        projectRoot: resolved.projectRoot,
        sessionId,
        success: false,
        error: pathError,
      },
    };
  }

  const registeredAgents = await listRegisteredAgentsForCli();
  const registeredAgent = registeredAgents.find(
    (item) =>
      item.projectRoot === resolved.projectRoot || item.id === agentId,
  );
  if (registeredAgent && registeredAgent.status !== "running") {
    return {
      success: false,
      outcome: {
        agentId,
        projectRoot: resolved.projectRoot,
        sessionId,
        success: false,
        error: "Agent is not running. Run `town agent start` first.",
      },
    };
  }

  return {
    success: true,
    target: {
      agentId,
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
  agentId: string;
  error?: string;
}): void {
  emitCliBlock({
    tone: "error",
    title: "Agent chat failed",
    facts: [
      {
        label: "agent",
        value: params.agentId,
      },
      {
        label: "error",
        value: buildAgentChatFailureText(params.error),
      },
    ],
  });
}

async function resolveAgentChatRemoteTarget(params: {
  projectRoot: string;
  transport?: AgentChatTransportOptions;
}): Promise<AgentChatRemoteTarget> {
  // 关键点（中文）：chat 固定走 Agent 本机 RPC，由 Town 负责对外暴露。
  const endpoint = resolveDaemonRpcEndpoint({
    projectRoot: params.projectRoot,
    host: params.transport?.host,
    port: params.transport?.port,
  });
  return {
    url: `rpc://${endpoint.host}:${endpoint.port}`,
  };
}

async function createRemoteAgent(params: {
  projectRoot: string;
  transport?: AgentChatTransportOptions;
}): Promise<RemoteAgent> {
  const target = await resolveAgentChatRemoteTarget(params);
  return new RemoteAgent({
    url: target.url,
  });
}

async function getOrCreateRemoteSession(params: {
  remote_agent: RemoteAgent;
  session_id: string;
}): Promise<RemoteAgentSession> {
  try {
    return await params.remote_agent.getSession(params.session_id);
  } catch {
    return await params.remote_agent.createSession({
      sessionId: params.session_id,
    });
  }
}

async function runSdkPromptTurn(params: {
  agentId: string;
  message: string;
  transport?: AgentChatTransportOptions;
  renderText?: boolean;
  interactiveRenderer?: AgentChatInteractiveRendererPort;
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

  const resolved = await resolveAgentChatTarget(params.agentId);
  if (!resolved.success) {
    return {
      success: false,
      error: resolved.outcome.error,
      emittedVisibleText: false,
      text: "",
    };
  }

  const remote_agent = await createRemoteAgent({
    projectRoot: resolved.target.projectRoot,
    transport: params.transport,
  });
  const session = await getOrCreateRemoteSession({
    remote_agent,
    session_id: resolved.target.sessionId,
  });

  let printed_leading_newline = false;
  let emitted_visible_text = false;
  let final_text = "";
  let target_turn_id = "";
  const pending_events: AgentSessionEvent[] = [];

  const renderEvent = (event: AgentSessionEvent): void => {
    if (params.interactiveRenderer) {
      params.interactiveRenderer.render_event(event);
      return;
    }
    if (event.type !== "text-delta" || event.turnId !== target_turn_id || !event.text) {
      return;
    }
    if (params.renderText === false) return;
    if (!printed_leading_newline) {
      process.stdout.write("\n");
      printed_leading_newline = true;
    }
    process.stdout.write(event.text);
    emitted_visible_text = true;
  };

  const unsubscribe = session.subscribe((event) => {
    if (!target_turn_id) {
      pending_events.push(event);
      return;
    }
    if ("turnId" in event && event.turnId && event.turnId !== target_turn_id) return;
    renderEvent(event);
    if (event.type === "turn-finish") {
      final_text = event.text;
    }
  });

  try {
    params.interactiveRenderer?.start_turn();
    const turn = await session.prompt({ query: message });
    target_turn_id = turn.id;
    params.interactiveRenderer?.attach_turn_id(target_turn_id);

    for (const event of pending_events) {
      if ("turnId" in event && event.turnId && event.turnId !== target_turn_id) continue;
      renderEvent(event);
      if (event.type === "turn-finish") {
        final_text = event.text;
      }
    }

    const result = await turn.finished;
    final_text = result.text;

    if (params.interactiveRenderer) {
      emitted_visible_text =
        params.interactiveRenderer.finish_turn().emitted_visible_text;
    } else if (printed_leading_newline) {
      process.stdout.write("\n\n");
    }

    return {
      success: result.success,
      ...(result.error ? { error: result.error } : {}),
      emittedVisibleText: emitted_visible_text,
      text: final_text,
    };
  } catch (error) {
    if (params.interactiveRenderer) {
      emitted_visible_text =
        params.interactiveRenderer.finish_turn().emitted_visible_text;
    } else if (printed_leading_newline) {
      process.stdout.write("\n\n");
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      emittedVisibleText: emitted_visible_text,
      text: final_text,
    };
  } finally {
    unsubscribe();
    await remote_agent.close();
  }
}

/**
 * 向目标 agent 的 SDK actor session 发送一轮消息。
 */
export async function executeAgentChatTurn(params: {
  agentId: string;
  message: string;
  transport?: AgentChatTransportOptions;
}): Promise<AgentChatExecutionOutcome> {
  const message = normalizeChatMessage(params.message);
  const sessionId = AGENT_CHAT_DEFAULT_SESSION_ID;

  if (!message) {
    return {
      agentId: String(params.agentId || "").trim(),
      sessionId,
      success: false,
      error: "Chat message is required.",
    };
  }

  const resolved = await resolveAgentChatTarget(params.agentId);
  if (!resolved.success) return resolved.outcome;

  const outcome = await runSdkPromptTurn({
    agentId: params.agentId,
    message,
    transport: params.transport,
    renderText: false,
  });

  return {
    agentId: params.agentId,
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
  agentId: string;
  message: string;
  options: AgentChatCliOptions;
}): Promise<void> {
  if (params.options.json === true) {
    const outcome = await executeAgentChatTurn({
      agentId: params.agentId,
      message: params.message,
      transport: {
        host: params.options.host,
        port: params.options.port,
      },
    });
    printResult({
      asJson: true,
      success: outcome.success,
      title: "agent chat",
      payload: {
        agent: params.agentId,
        ...(outcome.projectRoot ? { projectRoot: outcome.projectRoot } : {}),
        sessionId: outcome.sessionId,
        ...(outcome.payload?.result ? { result: outcome.payload.result } : {}),
        ...(outcome.error ? { error: outcome.error } : {}),
      },
    });
    return;
  }

  const outcome = await runSdkPromptTurn({
    agentId: params.agentId,
    message: params.message,
    transport: {
      host: params.options.host,
      port: params.options.port,
    },
  });

  if (!outcome.success) {
    printAgentChatFailure({
      agentId: params.agentId,
      error: outcome.error,
    });
    return;
  }

  if (!outcome.emittedVisibleText) printAssistantReply("");
}

/**
 * `town agent chat` 统一入口。
 */
export async function chatCommand(options: AgentChatCliOptions): Promise<void> {
  const agentId = await resolveChatTargetAgentId(options.to);
  if (!agentId) return;

  const oneShotMessage = normalizeChatMessage(String(options.message || ""));
  if (oneShotMessage) {
    await runOneShotChat({
      agentId,
      message: oneShotMessage,
      options,
    });
    return;
  }

  if (options.json === true) {
    emitCliBlock({
      tone: "error",
      title: "JSON mode requires --message",
      note: "Use `town agent chat --message <text> --json` for one-shot structured output.",
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

  await run_agent_chat_tui({
    agent_id: agentId,
    run_turn: async ({ message, interactive_renderer }) => {
      const outcome = await runSdkPromptTurn({
        agentId,
        message,
        transport: {
          host: options.host,
          port: options.port,
        },
        interactiveRenderer: interactive_renderer,
      });

      return {
        success: outcome.success,
        error: outcome.error,
        emitted_visible_text: outcome.emittedVisibleText,
        text: outcome.text,
      };
    },
  });
}
