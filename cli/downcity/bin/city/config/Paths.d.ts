export declare function getProfileMdPath(cwd: string): string;
export declare function getSoulMdPath(cwd: string): string;
export declare function getDowncityJsonPath(cwd: string): string;
export declare function getDowncityDirPath(cwd: string): string;
/**
 * 日志目录路径。
 */
export declare function getLogsDirPath(cwd: string): string;
export declare function getDowncitySchemaPath(cwd: string): string;
export declare function getCacheDirPath(cwd: string): string;
/**
 * 长期记忆文件路径（V2）。
 */
export declare function getDowncityMemoryLongTermPath(cwd: string): string;
/**
 * 每日记忆目录路径（V2）。
 */
export declare function getDowncityMemoryDailyDirPath(cwd: string): string;
/**
 * 每日记忆文件路径（V2）。
 */
export declare function getDowncityMemoryDailyPath(cwd: string, date: string): string;
export declare function getDowncitySessionRootDirPath(cwd: string, agentId: string): string;
export declare function getDowncitySessionDirPath(cwd: string, agentId: string, sessionId: string): string;
/**
 * Session Messages（会话消息，唯一事实源）。
 *
 * 关键点（中文）
 * - `.downcity/agents/<encodedAgentId>/sessions/<encodedSessionId>/messages/messages.jsonl`：每行一个 UIMessage（user/assistant）
 * - compact 会把被折叠的原始段写入 `messages/archive/*`（可审计）
 */
export declare function getDowncitySessionMessagesDirPath(cwd: string, agentId: string, sessionId: string): string;
/**
 * Session 消息事实源文件路径。
 */
export declare function getDowncitySessionMessagesPath(cwd: string, agentId: string, sessionId: string): string;
export declare function getDowncitySessionMessagesArchiveDirPath(cwd: string, agentId: string, sessionId: string): string;
/**
 * Session 消息归档文件路径。
 */
export declare function getDowncitySessionMessagesArchivePath(cwd: string, agentId: string, sessionId: string, archiveId: string): string;
/**
 * 任务运行目录路径。
 */
export declare function getDowncityTasksDirPath(cwd: string): string;
export declare function getDowncityDebugDirPath(cwd: string): string;
/**
 * `.downcity/public` 公开资源目录路径。
 */
export declare function getDowncityPublicDirPath(cwd: string): string;
/**
 * Channel 目录（channel -> sessionId 映射）。
 *
 * 关键点（中文）
 * - 专门承载渠道目标与内部 sessionId 的映射关系。
 * - 与 `chat/` 审计事件目录分离，避免职责混淆。
 */
export declare function getDowncityChannelDirPath(cwd: string): string;
/**
 * Channel 元信息文件路径。
 *
 * 关键点（中文）
 * - 采用单文件 JSON（`meta.json`）存储映射表与最近路由信息。
 */
export declare function getDowncityChannelMetaPath(cwd: string): string;
/**
 * Chat 会话目录（按 sessionId 组织）。
 *
 * 关键点（中文）
 * - 用于存放聊天事件流（history.jsonl）等审计向数据。
 * - 与 `chat/meta` 分离，避免路由快照与事件流混在一起。
 */
export declare function getDowncityChatSessionDirPath(cwd: string, sessionId: string): string;
/**
 * Chat 事件流文件路径（JSONL）。
 *
 * 关键点（中文）
 * - 每行一条 chat 事件（当前为 inbound）。
 * - 设计为 append-only，便于审计与回放。
 */
export declare function getDowncityChatHistoryPath(cwd: string, sessionId: string): string;
//# sourceMappingURL=Paths.d.ts.map