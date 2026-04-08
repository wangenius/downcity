/**
 * `city agent chat` 命令实现。
 *
 * 关键点（中文）
 * - 统一覆盖交互式持续对话与一次性消息模式，不再保留独立 `quest` 命令。
 * - 目标 agent 始终按 console registry 名称解析，不依赖当前工作目录。
 * - 默认复用 Console UI 主会话：`consoleui-chat-main`。
 */

import { createInterface } from "node:readline/promises";
import prompts from "prompts";
import { callAgentTransport } from "@/main/modules/rpc/Transport.js";
import { emitCliBlock } from "./CliReporter.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import {
  resolveProjectRootByAgentName,
  validateAgentProjectRoot,
} from "./ServiceCommandSupport.js";
import { listRegisteredAgentsForCli } from "./AgentSelection.js";
import type {
  AgentChatCliOptions,
  AgentChatExecutionOutcome,
  AgentChatExecuteResponse,
  AgentChatTransportOptions,
} from "@/types/cli/AgentChat.js";
import { AGENT_CHAT_DEFAULT_SESSION_ID } from "@/types/cli/AgentChat.js";

const AGENT_CHAT_EXECUTE_TIMEOUT_MS = 120_000;

function normalizeChatMessage(input: string): string {
  return String(input || "").trim();
}

function isChatSuccess(payload: AgentChatExecuteResponse | undefined): boolean {
  if (!payload || payload.success !== true) return false;
  if (payload.result?.success === false) return false;
  return true;
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

function printQueuedResult(params: {
  agentName: string;
  payload: AgentChatExecuteResponse;
}): void {
  emitCliBlock({
    tone: "info",
    title: "Turn queued",
    facts: [
      {
        label: "agent",
        value: params.agentName,
      },
      ...(params.payload.result?.queueItemId
        ? [
            {
              label: "queue item",
              value: params.payload.result.queueItemId,
            },
          ]
        : []),
    ],
  });
}

/**
 * 向目标 agent 的 Console 主会话发送一轮消息。
 */
export async function executeAgentChatTurn(params: {
  agentName: string;
  message: string;
  transport?: AgentChatTransportOptions;
}): Promise<AgentChatExecutionOutcome> {
  const agentName = String(params.agentName || "").trim();
  const message = normalizeChatMessage(params.message);
  const sessionId = AGENT_CHAT_DEFAULT_SESSION_ID;

  if (!agentName) {
    return {
      agentName: "",
      sessionId,
      success: false,
      error: "Missing target agent name.",
    };
  }

  if (!message) {
    return {
      agentName,
      sessionId,
      success: false,
      error: "Chat message is required.",
    };
  }

  const resolved = await resolveProjectRootByAgentName(agentName);
  if (!resolved.projectRoot) {
    return {
      agentName,
      sessionId,
      success: false,
      error: resolved.error || "Failed to resolve agent project path",
    };
  }

  const pathError = validateAgentProjectRoot(resolved.projectRoot);
  if (pathError) {
    return {
      agentName,
      projectRoot: resolved.projectRoot,
      sessionId,
      success: false,
      error: pathError,
    };
  }

  const remote = await callAgentTransport<AgentChatExecuteResponse>({
    projectRoot: resolved.projectRoot,
    path: `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/execute`,
    method: "POST",
    timeoutMs: AGENT_CHAT_EXECUTE_TIMEOUT_MS,
    host: params.transport?.host,
    port: params.transport?.port,
    authToken: params.transport?.token,
    body: {
      instructions: message,
    },
  });

  if (!remote.success || !remote.data) {
    return {
      agentName,
      projectRoot: resolved.projectRoot,
      sessionId,
      success: false,
      error: remote.error || "Unknown error",
    };
  }

  return {
    agentName,
    projectRoot: resolved.projectRoot,
    sessionId: String(remote.data.sessionId || sessionId),
    success: isChatSuccess(remote.data),
    payload: remote.data,
    ...(isChatSuccess(remote.data)
      ? {}
      : {
          error:
            String(remote.data.result?.error || remote.data.error || "").trim() ||
            "Unknown error",
        }),
  };
}

async function runOneShotChat(params: {
  agentName: string;
  message: string;
  options: AgentChatCliOptions;
}): Promise<void> {
  const outcome = await executeAgentChatTurn({
    agentName: params.agentName,
    message: params.message,
    transport: {
      host: params.options.host,
      port: params.options.port,
      token: params.options.token,
    },
  });

  if (params.options.json === true) {
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

  if (!outcome.success || !outcome.payload) {
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
          value: outcome.error || "Unknown error",
        },
      ],
    });
    return;
  }

  if (outcome.payload.result?.queued === true) {
    printQueuedResult({
      agentName: params.agentName,
      payload: outcome.payload,
    });
    return;
  }

  printAssistantReply(String(outcome.payload.result?.userVisible || ""));
}

/**
 * 启动交互式持续对话。
 */
async function runInteractiveChat(params: {
  agentName: string;
  options: AgentChatCliOptions;
}): Promise<void> {
  emitCliBlock({
    tone: "info",
    title: `Agent chat · ${params.agentName}`,
    note: "Shared session: consoleui-chat-main · Type /exit to quit.",
  });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  try {
    while (true) {
      const line = await rl.question(`${params.agentName}> `);
      const text = normalizeChatMessage(line);
      if (!text) continue;
      if (text === "/exit" || text === "/quit") break;

      const outcome = await executeAgentChatTurn({
        agentName: params.agentName,
        message: text,
        transport: {
          host: params.options.host,
          port: params.options.port,
          token: params.options.token,
        },
      });

      if (!outcome.success || !outcome.payload) {
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
              value: outcome.error || "Unknown error",
            },
          ],
        });
        continue;
      }

      if (outcome.payload.result?.queued === true) {
        printQueuedResult({
          agentName: params.agentName,
          payload: outcome.payload,
        });
        continue;
      }

      printAssistantReply(String(outcome.payload.result?.userVisible || ""));
    }
  } finally {
    rl.close();
  }
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
