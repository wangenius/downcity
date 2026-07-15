/**
 * ChatSessionDelete：按 sessionId 彻底删除 chat 会话数据。
 *
 * 关键点（中文）
 * - 删除路由映射（`.downcity/channel/meta.json`）
 * - 删除 chat 审计目录（`.downcity/chat/<sessionId>/`）
 * - 删除 core session 目录（`.downcity/agents/<agentId>/sessions/<sessionId>/`）
 * - 清理运行中 agent 与队列，避免残留任务继续执行
 */

import type { AgentContext } from "@downcity/agent";
import { resolveChatQueueStore } from "@/chat/runtime/ChatQueue.js";
import { clean_chat_storage } from "@/chat/runtime/ChatStorage.js";

function normalizeSessionId(sessionId: string): string {
  return String(sessionId || "").trim();
}

/**
 * 彻底删除一个 chat session。
 *
 * 关键点（中文）
 * - 幂等：目标不存在时返回 success + deleted=false，避免上层重试复杂化。
 */
export async function deleteChatSessionById(params: {
  context: AgentContext;
  sessionId: string;
}): Promise<{
  success: boolean;
  sessionId: string;
  deleted: boolean;
  removedMeta: boolean;
  removedChatDir: boolean;
  removedSessionDir: boolean;
  error?: string;
}> {
  const sessionId = normalizeSessionId(params.sessionId);
  if (!sessionId) {
    return {
      success: false,
      sessionId: "",
      deleted: false,
      removedMeta: false,
      removedChatDir: false,
      removedSessionDir: false,
      error: "Missing sessionId",
    };
  }

  try {
    // 关键点（中文）：先停执行，再删文件，避免删除过程中仍有任务写入。
    resolveChatQueueStore(params.context).clear(sessionId);

    const chat_result = await clean_chat_storage({
      root_path: params.context.rootPath,
      session_id: sessionId,
    });
    const removed_session_dir = await params.context.sessions.remove(sessionId);

    const deleted =
      chat_result.removed_route ||
      chat_result.removed_chat_dir ||
      removed_session_dir;

    return {
      success: true,
      sessionId,
      deleted,
      removedMeta: chat_result.removed_route,
      removedChatDir: chat_result.removed_chat_dir,
      removedSessionDir: removed_session_dir,
    };
  } catch (error) {
    return {
      success: false,
      sessionId,
      deleted: false,
      removedMeta: false,
      removedChatDir: false,
      removedSessionDir: false,
      error: String(error),
    };
  }
}
