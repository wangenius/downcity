/**
 * ChatContextDelete：按 contextId 彻底删除 chat 会话数据。
 *
 * 关键点（中文）
 * - 删除路由映射（`.downcity/channel/meta.json`）
 * - 删除 chat 审计目录（`.downcity/chat/<contextId>/`）
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
import { removeChatMetaByContextId } from "@services/chat/runtime/ChatMetaStore.js";

function normalizeContextId(contextId: string): string {
  return String(contextId || "").trim();
}

/**
 * 彻底删除一个 chat context。
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
  const contextId = normalizeContextId(params.sessionId);
  if (!contextId) {
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
    params.context.session.clearAgent(contextId);
    clearChatQueueLane(contextId);

    const removedMetaResult = await removeChatMetaByContextId({
      context: params.context,
      contextId,
    });

    const chatDir = getDowncityChatContextDirPath(params.context.rootPath, contextId);
    const contextDir = getDowncitySessionDirPath(params.context.rootPath, contextId);
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
      sessionId: contextId,
      deleted,
      removedMeta: removedMetaResult.removed,
      removedChatDir: hadChatDir,
      removedContextDir: hadContextDir,
    };
  } catch (error) {
    return {
      success: false,
      sessionId: contextId,
      deleted: false,
      removedMeta: false,
      removedChatDir: false,
      removedContextDir: false,
      error: String(error),
    };
  }
}
