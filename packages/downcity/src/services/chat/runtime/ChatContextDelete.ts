/**
 * ChatContextDelete：按 sessionId 彻底删除 chat 会话数据。
 *
 * 关键点（中文）
 * - 删除路由映射（`.downcity/channel/meta.json`）
 * - 删除 chat 审计目录（`.downcity/chat/<sessionId>/`）
 * - 删除 core session 目录（`.downcity/session/<sessionId>/`）
 * - 清理运行中 agent 与队列，避免残留任务继续执行
 */

import fs from "fs-extra";
import {
  getDowncityChatContextDirPath,
  getDowncitySessionDirPath,
} from "@/console/env/Paths.js";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import { clearChatQueueLane } from "@services/chat/runtime/ChatQueue.js";
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
export async function deleteChatContextById(params: {
  context: ServiceRuntime;
  sessionId: string;
}): Promise<{
  success: boolean;
  sessionId: string;
  deleted: boolean;
  removedMeta: boolean;
  removedChatDir: boolean;
  removedContextDir: boolean;
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
      removedContextDir: false,
      error: "Missing sessionId",
    };
  }

  try {
    // 关键点（中文）：先停执行，再删文件，避免删除过程中仍有任务写入。
    params.context.session.clearAgent(sessionId);
    clearChatQueueLane(sessionId);

    const removedMetaResult = await removeChatMetaBySessionId({
      context: params.context,
      sessionId,
    });

    const chatDir = getDowncityChatContextDirPath(params.context.rootPath, sessionId);
    const contextDir = getDowncitySessionDirPath(params.context.rootPath, sessionId);
    const hadChatDir = await fs.pathExists(chatDir);
    const hadContextDir = await fs.pathExists(contextDir);
    if (hadChatDir) {
      await fs.remove(chatDir);
    }
    if (hadContextDir) {
      await fs.remove(contextDir);
    }

    const deleted =
      removedMetaResult.removed || hadChatDir || hadContextDir;

    return {
      success: true,
      sessionId,
      deleted,
      removedMeta: removedMetaResult.removed,
      removedChatDir: hadChatDir,
      removedContextDir: hadContextDir,
    };
  } catch (error) {
    return {
      success: false,
      sessionId,
      deleted: false,
      removedMeta: false,
      removedChatDir: false,
      removedContextDir: false,
      error: String(error),
    };
  }
}
