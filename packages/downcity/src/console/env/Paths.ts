/**
 * Env Paths：路径构造工具模块。
 *
 * 职责说明：
 * 1. 统一管理项目内 `.downcity` 及其子目录/文件路径规则。
 * 2. 避免路径字符串在不同模块重复拼接，降低维护成本。
 * 3. 通过集中入口保证目录结构调整时只需改动一处。
 */
import path from "path";

/**
 * PROFILE.md 候选文件名（按优先级从高到低）。
 *
 * 关键点（中文）
 * - 统一使用大写文件名：`PROFILE.md`。
 * - 与 SOUL 一起作为静态 prompt 入口。
 */
export const PROFILE_MD_FILE_CANDIDATES = ["PROFILE.md"] as const;

export function getProfileMdPath(cwd: string): string {
  return path.join(cwd, PROFILE_MD_FILE_CANDIDATES[0]);
}

export function getProfileMdCandidatePaths(cwd: string): string[] {
  return PROFILE_MD_FILE_CANDIDATES.map((filename) => path.join(cwd, filename));
}

/**
 * SOUL.md 候选文件名（按优先级从高到低）。
 *
 * 关键点（中文）
 * - 统一使用大写文件名：`SOUL.md`。
 * - 统一由 Paths 模块暴露，避免调用方散落硬编码。
 */
export const SOUL_MD_FILE_CANDIDATES = ["SOUL.md"] as const;

export function getSoulMdPath(cwd: string): string {
  return path.join(cwd, SOUL_MD_FILE_CANDIDATES[0]);
}

export function getSoulMdCandidatePaths(cwd: string): string[] {
  return SOUL_MD_FILE_CANDIDATES.map((filename) => path.join(cwd, filename));
}

export function getShipJsonPath(cwd: string): string {
  return path.join(cwd, "downcity.json");
}

export function getShipDirPath(cwd: string): string {
  return path.join(cwd, ".downcity");
}

export function getShipSchemaPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "schema", "downcity.schema.json");
}

export function getShipConfigDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "config");
}

export function getLogsDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "logs");
}

export function getCacheDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), ".cache");
}

export function getShipProfileDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "profile");
}

export function getShipProfilePrimaryPath(cwd: string): string {
  return path.join(getShipProfileDirPath(cwd), "Primary.md");
}

export function getShipProfileOtherPath(cwd: string): string {
  return path.join(getShipProfileDirPath(cwd), "other.md");
}

/**
 * Memory 根目录（V2）。
 *
 * 关键点（中文）
 * - `.downcity/memory` 为跨会话记忆目录。
 */
export function getShipMemoryDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "memory");
}

/**
 * 长期记忆文件路径（V2）。
 */
export function getShipMemoryLongTermPath(cwd: string): string {
  return path.join(getShipMemoryDirPath(cwd), "MEMORY.md");
}

/**
 * 每日记忆目录路径（V2）。
 */
export function getShipMemoryDailyDirPath(cwd: string): string {
  return path.join(getShipMemoryDirPath(cwd), "daily");
}

/**
 * 每日记忆文件路径（V2）。
 */
export function getShipMemoryDailyPath(cwd: string, date: string): string {
  const fileName = `${String(date || "").trim() || "unknown-date"}.md`;
  return path.join(getShipMemoryDailyDirPath(cwd), fileName);
}

/**
 * Memory 索引文件路径（V2）。
 */
export function getShipMemoryIndexPath(cwd: string): string {
  return path.join(getShipMemoryDirPath(cwd), "index.sqlite");
}

/**
 * Service Schedule SQLite 路径。
 *
 * 关键点（中文）
 * - 调度任务属于项目 runtime 本地状态，因此放在项目 `.downcity/` 下。
 */
export function getShipScheduleDbPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "schedule.sqlite");
}

export function getShipDataDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "data");
}

export function getShipContextRootDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "context");
}

export function getShipContextDirPath(cwd: string, contextId: string): string {
  return path.join(getShipContextRootDirPath(cwd), encodeURIComponent(contextId));
}

/**
 * Context Messages（会话上下文消息，唯一事实源）。
 *
 * 关键点（中文）
 * - `.downcity/context/<encodedContextId>/messages/messages.jsonl`：每行一个 UIMessage（user/assistant）
 * - compact 会把被折叠的原始段写入 `messages/archive/*`（可审计）
 */
export function getShipContextMessagesDirPath(
  cwd: string,
  contextId: string,
): string {
  return path.join(getShipContextDirPath(cwd, contextId), "messages");
}

export function getShipContextMessagesPath(cwd: string, contextId: string): string {
  return path.join(getShipContextMessagesDirPath(cwd, contextId), "messages.jsonl");
}

export function getShipContextMessagesMetaPath(cwd: string, contextId: string): string {
  return path.join(getShipContextMessagesDirPath(cwd, contextId), "meta.json");
}

export function getShipContextMessagesArchiveDirPath(
  cwd: string,
  contextId: string,
): string {
  return path.join(getShipContextMessagesDirPath(cwd, contextId), "archive");
}

export function getShipContextMessagesArchivePath(
  cwd: string,
  contextId: string,
  archiveId: string,
): string {
  return path.join(
    getShipContextMessagesArchiveDirPath(cwd, contextId),
    `${encodeURIComponent(String(archiveId || "").trim())}.json`,
  );
}

export function getShipContextMemoryDirPath(cwd: string, contextId: string): string {
  return path.join(getShipContextDirPath(cwd, contextId), "memory");
}

export function getShipContextMemoryPrimaryPath(
  cwd: string,
  contextId: string,
): string {
  return path.join(getShipContextMemoryDirPath(cwd, contextId), "Primary.md");
}

export function getShipContextMemoryBackupDirPath(
  cwd: string,
  contextId: string,
): string {
  return path.join(getShipContextMemoryDirPath(cwd, contextId), "backup");
}

export function getShipContextMemoryBackupPath(
  cwd: string,
  contextId: string,
  timestamp: number,
): string {
  return path.join(
    getShipContextMemoryBackupDirPath(cwd, contextId),
    `Primary-${timestamp}.md`,
  );
}

export function getShipContextMemoryMetaPath(cwd: string, contextId: string): string {
  return path.join(getShipContextMemoryDirPath(cwd, contextId), ".meta.json");
}

export function getShipPublicDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "public");
}

export function getShipTasksDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "task");
}

export function getShipDebugDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), ".debug");
}

/**
 * Chat 元信息目录（由 services/chat 维护）。
 *
 * 关键点（中文）
 * - 该目录存放 `contextId -> chat` 的最近映射快照
 * - 与 core context messages 分离，避免把平台路由细节耦合进 core
 */
export function getShipChatDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "chat");
}

/**
 * Channel 目录（channel -> contextId 映射）。
 *
 * 关键点（中文）
 * - 专门承载渠道目标与内部 contextId 的映射关系。
 * - 与 `chat/` 审计事件目录分离，避免职责混淆。
 */
export function getShipChannelDirPath(cwd: string): string {
  return path.join(getShipDirPath(cwd), "channel");
}

/**
 * Channel 元信息文件路径。
 *
 * 关键点（中文）
 * - 采用单文件 JSON（`meta.json`）存储映射表与最近路由信息。
 */
export function getShipChannelMetaPath(cwd: string): string {
  return path.join(getShipChannelDirPath(cwd), "meta.json");
}

export function getShipChatMetaDirPath(cwd: string): string {
  return path.join(getShipChatDirPath(cwd), "meta");
}

export function getShipChatMetaPath(cwd: string, contextId: string): string {
  return path.join(
    getShipChatMetaDirPath(cwd),
    `${encodeURIComponent(String(contextId || "").trim())}.json`,
  );
}

/**
 * Chat 会话目录（按 contextId 组织）。
 *
 * 关键点（中文）
 * - 用于存放聊天事件流（history.jsonl）等审计向数据。
 * - 与 `chat/meta` 分离，避免路由快照与事件流混在一起。
 */
export function getShipChatContextDirPath(cwd: string, contextId: string): string {
  return path.join(
    getShipChatDirPath(cwd),
    encodeURIComponent(String(contextId || "").trim()),
  );
}

/**
 * Chat 事件流文件路径（JSONL）。
 *
 * 关键点（中文）
 * - 每行一条 chat 事件（当前为 inbound）。
 * - 设计为 append-only，便于审计与回放。
 */
export function getShipChatHistoryPath(cwd: string, contextId: string): string {
  return path.join(getShipChatContextDirPath(cwd, contextId), "history.jsonl");
}
