/**
 * `city agent quest` 命令实现。
 *
 * 关键点（中文）
 * - 复用 Dashboard session execute 路由，避免新增一套专用 RPC。
 * - 默认写入 `consoleui-chat-main`，与 Console UI 主会话共享上下文。
 * - 面向人类使用时默认直接打印回复文本；`--json` 仅作为脚本模式。
 */

import { callAgentTransport, resolveAgentTransportErrorMessage } from "@/main/modules/rpc/Transport.js";
import { emitCliBlock } from "./CliReporter.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import {
  resolveProjectRootByAgentName,
  validateAgentProjectRoot,
} from "./ServiceCommandSupport.js";
import type {
  AgentQuestCliOptions,
  AgentQuestExecutionOutcome,
  AgentQuestExecuteResponse,
  AgentQuestTransportOptions,
} from "@/types/cli/AgentQuest.js";
import { AGENT_QUEST_DEFAULT_SESSION_ID } from "@/types/cli/AgentQuest.js";

function normalizeQuestInstructions(input: string[]): string {
  return input
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function isQuestSuccess(payload: AgentQuestExecuteResponse | undefined): boolean {
  if (!payload || payload.success !== true) return false;
  if (payload.result?.success === false) return false;
  return true;
}

function printQuestTextResult(params: {
  agentName: string;
  payload: AgentQuestExecuteResponse;
}): void {
  const replyText = String(params.payload.result?.userVisible || "").trim();
  if (replyText) {
    console.log(replyText);
    return;
  }

  if (params.payload.result?.queued === true) {
    emitCliBlock({
      tone: "info",
      title: "Quest queued",
      facts: [
        {
          label: "agent",
          value: params.agentName,
        },
        {
          label: "session",
          value: String(params.payload.sessionId || AGENT_QUEST_DEFAULT_SESSION_ID),
        },
        ...(params.payload.result.queueItemId
          ? [
              {
                label: "queue item",
                value: params.payload.result.queueItemId,
              },
            ]
          : []),
        ...(typeof params.payload.result.queuePosition === "number"
          ? [
              {
                label: "queue position",
                value: String(params.payload.result.queuePosition),
              },
            ]
          : []),
      ],
    });
    return;
  }

  emitCliBlock({
    tone: "success",
    title: "Quest completed",
    facts: [
      {
        label: "agent",
        value: params.agentName,
      },
      {
        label: "session",
        value: String(params.payload.sessionId || AGENT_QUEST_DEFAULT_SESSION_ID),
      },
    ],
  });
}

/**
 * 向目标 agent 的 Console 主会话发送一次执行请求。
 */
export async function executeAgentQuest(params: {
  agentName: string;
  instructions: string;
  transport?: AgentQuestTransportOptions;
}): Promise<AgentQuestExecutionOutcome> {
  const agentName = String(params.agentName || "").trim();
  const instructions = String(params.instructions || "").trim();
  const sessionId = AGENT_QUEST_DEFAULT_SESSION_ID;

  if (!agentName) {
    return {
      agentName: "",
      sessionId,
      success: false,
      error: "Missing target agent name.",
    };
  }

  if (!instructions) {
    return {
      agentName,
      sessionId,
      success: false,
      error: "Quest text is required.",
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

  const remote = await callAgentTransport<AgentQuestExecuteResponse>({
    projectRoot: resolved.projectRoot,
    path: `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/execute`,
    method: "POST",
    host: params.transport?.host,
    port: params.transport?.port,
    authToken: params.transport?.token,
    body: {
      instructions,
    },
  });

  if (!remote.success || !remote.data) {
    return {
      agentName,
      projectRoot: resolved.projectRoot,
      sessionId,
      success: false,
      error: resolveAgentTransportErrorMessage({
        error: remote.error,
        fallback: "Agent quest requires an active Agent server. Start via `city agent start` first.",
      }),
    };
  }

  return {
    agentName,
    projectRoot: resolved.projectRoot,
    sessionId: String(remote.data.sessionId || sessionId),
    success: isQuestSuccess(remote.data),
    payload: remote.data,
    ...(isQuestSuccess(remote.data)
      ? {}
      : {
          error:
            String(remote.data.result?.error || remote.data.error || "").trim() ||
            "Unknown error",
        }),
  };
}

/**
 * 执行一次 agent quest。
 */
export async function questCommand(params: {
  instructions: string[];
  options: AgentQuestCliOptions;
}): Promise<void> {
  const agentName = String(params.options.to || "").trim();
  const instructions = normalizeQuestInstructions(params.instructions);
  const asJson = params.options.json === true;

  if (!agentName) {
    printResult({
      asJson,
      success: false,
      title: "agent quest failed",
      payload: {
        error: "Missing required option: --to <agentName>",
      },
    });
    return;
  }

  if (!instructions) {
    printResult({
      asJson,
      success: false,
      title: "agent quest failed",
      payload: {
        error: "Quest text is required.",
      },
    });
    return;
  }

  const outcome = await executeAgentQuest({
    agentName,
    instructions,
    transport: {
      host: params.options.host,
      port: params.options.port,
      token: params.options.token,
    },
  });
  if (!outcome.payload && !outcome.success) {
    printResult({
      asJson,
      success: false,
      title: "agent quest failed",
      payload: {
        agent: agentName,
        ...(outcome.projectRoot ? { projectRoot: outcome.projectRoot } : {}),
        error: outcome.error || "Unknown error",
      },
    });
    return;
  }

  if (asJson) {
    printResult({
      asJson: true,
      success: outcome.success,
      title: "agent quest",
      payload: {
        agent: agentName,
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
      title: "Agent quest failed",
      facts: [
        {
          label: "agent",
          value: agentName,
        },
        {
          label: "error",
          value: outcome.error || "Unknown error",
        },
      ],
    });
    return;
  }

  printQuestTextResult({
    agentName,
    payload: outcome.payload,
  });
}
