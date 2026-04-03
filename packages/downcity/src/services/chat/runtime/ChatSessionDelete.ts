/**
 * ChatSessionDelete：按 sessionId 彻底删除 chat 会话数据。
 *
 * 关键点（中文）
 * - 删除路由映射（`.downcity/channel/meta.json`）
 * - 删除 chat 审计目录（`.downcity/chat/<sessionId>/`）
 * - 删除 core session 目录（`.downcity/session/<sessionId>/`）
 * - 清理运行中 agent 与队列，避免残留任务继续执行
 */

import fs from "fs-extra";
import path from "node:path";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import { resolveChatQueueStore } from "@services/chat/runtime/ChatQueue.js";
import { removeChatMetaBySessionId } from "@services/chat/runtime/ChatMetaStore.js";

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
  context: ExecutionContext;
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
    params.context.session.clearRuntime(sessionId);
    resolveChatQueueStore(params.context).clear(sessionId);

    const removedMetaResult = await removeChatMetaBySessionId({
      context: params.context,
      sessionId,
    });

    const chatDir = path.join(params.context.rootPath, ".downcity", "chat", sessionId);
    const sessionDir = params.context.paths.getDowncitySessionDirPath(sessionId);
    const hadChatDir = await fs.pathExists(chatDir);
    const hadSessionDir = await fs.pathExists(sessionDir);
    if (hadChatDir) {
      await fs.remove(chatDir);
    }
    if (hadSessionDir) {
      await fs.remove(sessionDir);
    }

    const deleted =
      removedMetaResult.removed || hadChatDir || hadSessionDir;

    return {
      success: true,
      sessionId,
      deleted,
      removedMeta: removedMetaResult.removed,
      removedChatDir: hadChatDir,
      removedSessionDir: hadSessionDir,
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
