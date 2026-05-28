/**
 * Control execute by session helper。
 *
 * 关键点（中文）
 * - control 层只负责把请求转成 session prompt。
 * - chat / queue 等渠道语义由宿主显式注入的 plugin 自行实现。
 */

import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { ControlSessionExecuteAttachmentInput } from "@/runtime/server/http/control/types/ControlSessionExecute.js";
import { buildExecuteInputText } from "./Helpers.js";

/**
 * 在指定 session 中执行一轮请求。
 *
 * 说明（中文）
 * - 按普通 session 同步执行。
 */
export async function executeBySessionId(params: {
  agentState: AgentRuntime;
  executionContext: AgentContext;
  sessionId: string;
  instructions: string;
  attachments?: ControlSessionExecuteAttachmentInput[];
}) {
  const sessionId = String(params.sessionId || "").trim();
  const instructions = String(params.instructions || "").trim();
  if (!sessionId) throw new Error("Missing sessionId");
  if (!instructions) throw new Error("Missing instructions");

  const executeInput = await buildExecuteInputText({
    projectRoot: params.agentState.rootPath,
    sessionId,
    instructions,
    attachments: params.attachments,
  });

  const session = params.agentState.getSession(sessionId);
  const turn = await session.prompt({
    query: executeInput,
  });
  const result = await turn.finished;

  return {
    success: result.success,
    ...(result.error ? { error: result.error } : {}),
    assistantMessage: result.assistantMessage,
    userVisible: result.text.trim(),
    queued: false,
  };
}
