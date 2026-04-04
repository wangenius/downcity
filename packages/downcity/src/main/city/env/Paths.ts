/**
 * City Env Paths：项目与运行目录路径规则模块。
 *
 * 关键点（中文）
 * - 统一管理单个 agent 项目内 `.downcity` 及其子目录/文件路径规则。
 * - 避免路径字符串在不同模块重复拼接，降低维护成本。
 * - 这里描述的是“项目级路径约定”，与 `main/city/runtime/CityPaths.ts` 的全局路径约定分开。
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

export function getDowncityJsonPath(cwd: string): string {
  return path.join(cwd, "downcity.json");
}

export function getDowncityDirPath(cwd: string): string {
  return path.join(cwd, ".downcity");
}

export function getDowncitySchemaPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "schema", "downcity.schema.json");
}

export function getDowncityConfigDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "config");
}

export function getLogsDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "logs");
}

export function getCacheDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), ".cache");
}

export function getDowncityProfileDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "profile");
}

export function getDowncityProfilePrimaryPath(cwd: string): string {
  return path.join(getDowncityProfileDirPath(cwd), "Primary.md");
}

export function getDowncityProfileOtherPath(cwd: string): string {
  return path.join(getDowncityProfileDirPath(cwd), "other.md");
}

/**
 * Memory 根目录（V2）。
 *
 * 关键点（中文）
 * - `.downcity/memory` 为跨会话记忆目录。
 */
export function getDowncityMemoryDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "memory");
}

/**
 * 长期记忆文件路径（V2）。
 */
export function getDowncityMemoryLongTermPath(cwd: string): string {
  return path.join(getDowncityMemoryDirPath(cwd), "MEMORY.md");
}

/**
 * 每日记忆目录路径（V2）。
 */
export function getDowncityMemoryDailyDirPath(cwd: string): string {
  return path.join(getDowncityMemoryDirPath(cwd), "daily");
}

/**
 * 每日记忆文件路径（V2）。
 */
export function getDowncityMemoryDailyPath(cwd: string, date: string): string {
  const fileName = `${String(date || "").trim() || "unknown-date"}.md`;
  return path.join(getDowncityMemoryDailyDirPath(cwd), fileName);
}

/**
 * Memory 索引文件路径（V2）。
 */
export function getDowncityMemoryIndexPath(cwd: string): string {
  return path.join(getDowncityMemoryDirPath(cwd), "index.sqlite");
}

/**
 * Service Schedule SQLite 路径。
 *
 * 关键点（中文）
 * - 调度任务属于项目 runtime 本地状态，因此放在项目 `.downcity/` 下。
 */
export function getDowncityScheduleDbPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "schedule.sqlite");
}

export function getDowncityDataDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "data");
}

export function getDowncitySessionRootDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "session");
}

export function getDowncitySessionDirPath(cwd: string, sessionId: string): string {
  return path.join(getDowncitySessionRootDirPath(cwd), encodeURIComponent(sessionId));
}

/**
 * Session Messages（会话消息，唯一事实源）。
 *
 * 关键点（中文）
 * - `.downcity/session/<encodedSessionId>/messages/messages.jsonl`：每行一个 UIMessage（user/assistant）
 * - compact 会把被折叠的原始段写入 `messages/archive/*`（可审计）
 */
export function getDowncitySessionMessagesDirPath(
  cwd: string,
  sessionId: string,
): string {
  return path.join(getDowncitySessionDirPath(cwd, sessionId), "messages");
}

export function getDowncitySessionMessagesPath(cwd: string, sessionId: string): string {
  return path.join(getDowncitySessionMessagesDirPath(cwd, sessionId), "messages.jsonl");
}

export function getDowncitySessionMessagesMetaPath(cwd: string, sessionId: string): string {
  return path.join(getDowncitySessionMessagesDirPath(cwd, sessionId), "meta.json");
}

export function getDowncitySessionMessagesArchiveDirPath(
  cwd: string,
  sessionId: string,
): string {
  return path.join(getDowncitySessionMessagesDirPath(cwd, sessionId), "archive");
}

export function getDowncitySessionMessagesArchivePath(
  cwd: string,
  sessionId: string,
  archiveId: string,
): string {
  return path.join(
    getDowncitySessionMessagesArchiveDirPath(cwd, sessionId),
    `${encodeURIComponent(String(archiveId || "").trim())}.json`,
  );
}

export function getDowncitySessionMemoryDirPath(cwd: string, sessionId: string): string {
  return path.join(getDowncitySessionDirPath(cwd, sessionId), "memory");
}

export function getDowncitySessionMemoryPrimaryPath(
  cwd: string,
  sessionId: string,
): string {
  return path.join(getDowncitySessionMemoryDirPath(cwd, sessionId), "Primary.md");
}

export function getDowncitySessionMemoryBackupDirPath(
  cwd: string,
  sessionId: string,
): string {
  return path.join(getDowncitySessionMemoryDirPath(cwd, sessionId), "backup");
}

export function getDowncitySessionMemoryBackupPath(
  cwd: string,
  sessionId: string,
  timestamp: number,
): string {
  return path.join(
    getDowncitySessionMemoryBackupDirPath(cwd, sessionId),
    `Primary-${timestamp}.md`,
  );
}

export function getDowncitySessionMemoryMetaPath(cwd: string, sessionId: string): string {
  return path.join(getDowncitySessionMemoryDirPath(cwd, sessionId), ".meta.json");
}

export function getDowncityPublicDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "public");
}

export function getDowncityTasksDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "task");
}

export function getDowncityDebugDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), ".debug");
}

/**
 * Chat 元信息目录（由 services/chat 维护）。
 *
 * 关键点（中文）
 * - 该目录存放 `sessionId -> chat` 的最近映射快照
 * - 与 core session messages 分离，避免把平台路由细节耦合进 core
 */
export function getDowncityChatDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "chat");
}

/**
 * Channel 目录（channel -> sessionId 映射）。
 *
 * 关键点（中文）
 * - 专门承载渠道目标与内部 sessionId 的映射关系。
 * - 与 `chat/` 审计事件目录分离，避免职责混淆。
 */
export function getDowncityChannelDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "channel");
}

/**
 * Channel 元信息文件路径。
 *
 * 关键点（中文）
 * - 采用单文件 JSON（`meta.json`）存储映射表与最近路由信息。
 */
export function getDowncityChannelMetaPath(cwd: string): string {
  return path.join(getDowncityChannelDirPath(cwd), "meta.json");
}

export function getDowncityChatMetaDirPath(cwd: string): string {
  return path.join(getDowncityChatDirPath(cwd), "meta");
}

export function getDowncityChatMetaPath(cwd: string, sessionId: string): string {
  return path.join(
    getDowncityChatMetaDirPath(cwd),
    `${encodeURIComponent(String(sessionId || "").trim())}.json`,
  );
}

/**
 * Chat 会话目录（按 sessionId 组织）。
 *
 * 关键点（中文）
 * - 用于存放聊天事件流（history.jsonl）等审计向数据。
 * - 与 `chat/meta` 分离，避免路由快照与事件流混在一起。
 */
export function getDowncityChatSessionDirPath(cwd: string, sessionId: string): string {
  return path.join(
    getDowncityChatDirPath(cwd),
    encodeURIComponent(String(sessionId || "").trim()),
  );
}

/**
 * Chat 事件流文件路径（JSONL）。
 *
 * 关键点（中文）
 * - 每行一条 chat 事件（当前为 inbound）。
 * - 设计为 append-only，便于审计与回放。
 */
export function getDowncityChatHistoryPath(cwd: string, sessionId: string): string {
  return path.join(getDowncityChatSessionDirPath(cwd, sessionId), "history.jsonl");
}
