/**
 * Agent 项目路径规则模块。
 *
 * 职责说明（中文）
 * - 统一管理单个 agent 项目根目录下的静态文件、`.downcity` 目录与运行时状态文件路径。
 * - 负责把“路径协议”集中到一个模块，避免各领域模块自行拼接字符串。
 * - 为初始化、会话存储、聊天路由、调试文件等子系统提供一致的路径入口。
 *
 * 边界说明（中文）
 * - 这里只负责路径计算，不负责目录创建、文件读写或存在性校验。
 * - 这里描述的是单项目约定，不涉及平台级全局目录布局。
 */
import path from "path";

/**
 * 返回项目运行时状态根目录 `.downcity` 的路径。
 */
export function getDowncityDirPath(cwd: string): string {
  return path.join(cwd, ".downcity");
}

/**
 * 返回项目日志目录路径。
 */
export function getLogsDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "logs");
}

/**
 * 返回项目缓存目录路径。
 *
 * 关键点（中文）
 * - 当前使用隐藏命名 `.cache`，避免与用户业务目录混淆。
 */
export function getCacheDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), ".cache");
}

/**
 * 返回 profile 运行态目录路径。
 *
 * 关键点（中文）
 * - 初始化流程会统一创建该目录，并在其中写入 profile 相关文件。
 * - 单独保留目录级 API，避免调用方散落 `path.join(..., "profile")`。
 */
export function getDowncityProfileDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "profile");
}

/**
 * 返回 profile 主记忆文件路径。
 *
 * 关键点（中文）
 * - 该文件通常承载主画像或核心长期 profile 信息。
 */
export function getDowncityProfilePrimaryPath(cwd: string): string {
  return path.join(getDowncityProfileDirPath(cwd), "Primary.md");
}

/**
 * 返回 profile 补充记忆文件路径。
 *
 * 关键点（中文）
 * - 该文件用于存放不适合进入主 profile 的补充材料。
 */
export function getDowncityProfileOtherPath(cwd: string): string {
  return path.join(getDowncityProfileDirPath(cwd), "other.md");
}

/**
 * Plugin Schedule JSONL 路径。
 *
 * 关键点（中文）
 * - 调度任务属于项目 runtime 本地状态，因此放在项目 `.downcity/` 下。
 */
export function getDowncityScheduleDbPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "schedule.jsonl");
}

/**
 * 返回项目运行时数据目录路径。
 */
export function getDowncityDataDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "data");
}

/**
 * 返回项目内全部 agent 实例目录的根路径。
 *
 * 关键点（中文）
 * - 单项目虽然通常只有一个 agent 入口，但底层仍按 agentId 分层组织。
 */
export function getDowncityAgentsRootDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "agents");
}

/**
 * 返回指定 agent 的运行态目录路径。
 *
 * 关键点（中文）
 * - `agentId` 会做 URL 编码，避免特殊字符污染文件系统结构。
 * - 当前仅供本模块内部拼接 session 根目录使用。
 */
function getDowncityAgentDirPath(cwd: string, agentId: string): string {
  return path.join(
    getDowncityAgentsRootDirPath(cwd),
    encodeURIComponent(String(agentId || "").trim()),
  );
}

/**
 * 返回指定 agent 的 session 根目录路径。
 */
export function getDowncitySessionRootDirPath(
  cwd: string,
  agentId: string,
): string {
  return path.join(getDowncityAgentDirPath(cwd, agentId), "sessions");
}

/**
 * 返回指定 session 的运行态目录路径。
 *
 * 关键点（中文）
 * - `sessionId` 同样会做 URL 编码，保证路径可安全持久化。
 */
export function getDowncitySessionDirPath(
  cwd: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getDowncitySessionRootDirPath(cwd, agentId),
    encodeURIComponent(String(sessionId || "").trim()),
  );
}

/**
 * Session Messages（会话消息，唯一事实源）。
 *
 * 关键点（中文）
 * - `.downcity/agents/<encodedAgentId>/sessions/<encodedSessionId>/messages/messages.jsonl`：每行一个 UIMessage（user/assistant）
 * - compact 会把被折叠的原始段写入 `messages/archive/*`（可审计）
 */
export function getDowncitySessionMessagesDirPath(
  cwd: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(getDowncitySessionDirPath(cwd, agentId, sessionId), "messages");
}

/**
 * 返回 session 消息事实源文件路径。
 *
 * 关键点（中文）
 * - 当前唯一事实源是 `messages.jsonl`，所有历史组装都应基于它。
 */
export function getDowncitySessionMessagesPath(
  cwd: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getDowncitySessionMessagesDirPath(cwd, agentId, sessionId),
    "messages.jsonl",
  );
}

/**
 * 返回 session 消息归档目录路径。
 *
 * 关键点（中文）
 * - compaction 时被折叠的原始消息段会写入该目录，便于审计和回溯。
 */
export function getDowncitySessionMessagesArchiveDirPath(
  cwd: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getDowncitySessionMessagesDirPath(cwd, agentId, sessionId),
    "archive",
  );
}

/**
 * 返回指定归档文件的完整路径。
 *
 * 关键点（中文）
 * - `archiveId` 会做 URL 编码，避免 compaction 生成的标识污染文件名。
 */
export function getDowncitySessionMessagesArchivePath(
  cwd: string,
  agentId: string,
  sessionId: string,
  archiveId: string,
): string {
  return path.join(
    getDowncitySessionMessagesArchiveDirPath(cwd, agentId, sessionId),
    `${encodeURIComponent(String(archiveId || "").trim())}.json`,
  );
}

/**
 * 返回项目公开静态资源目录路径。
 */
export function getDowncityPublicDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "public");
}

/**
 * 返回项目资源目录路径。
 *
 * 关键点（中文）
 * - 该目录用于存放会话历史引用的二进制资源，例如图片生成结果。
 * - `messages.jsonl` 只保存 Agent 根目录相对路径，避免暴露本机绝对路径或长期保存 base64。
 */
export function getDowncityResourcesDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "resources");
}

/**
 * 返回项目任务目录路径。
 *
 * 关键点（中文）
 * - 该目录用于存放任务相关的本地文件与运行时数据。
 */
export function getDowncityTasksDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "task");
}

/**
 * 返回项目调试目录路径。
 *
 * 关键点（中文）
 * - 当前使用隐藏目录 `.debug`，避免与用户显式业务目录冲突。
 */
export function getDowncityDebugDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), ".debug");
}
