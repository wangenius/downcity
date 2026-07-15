/**
 * City Env Paths：项目与运行目录路径规则模块。
 *
 * 关键点（中文）
 * - 统一管理单个 agent 项目内 `.downcity` 及其子目录/文件路径规则。
 * - 避免路径字符串在不同模块重复拼接，降低维护成本。
 * - 这里描述的是“项目级路径约定”，与 `process/registry/CityPaths.ts` 的全局路径约定分开。
 */
import path from "path";

export function getDowncityDirPath(cwd: string): string {
  return path.join(cwd, ".downcity");
}

/**
 * 日志目录路径。
 */
export function getLogsDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "logs");
}

export function getCacheDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), ".cache");
}

/**
 * Plugin Schedule JSONL 路径。
 *
 * 关键点（中文）
 * - 调度任务属于项目 runtime 本地状态，因此放在项目 `.downcity/` 下。
 */
function getDowncityAgentsRootDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "agents");
}

function getDowncityAgentDirPath(cwd: string, agentId: string): string {
  return path.join(
    getDowncityAgentsRootDirPath(cwd),
    encodeURIComponent(String(agentId || "").trim()),
  );
}

export function getDowncitySessionRootDirPath(
  cwd: string,
  agentId: string,
): string {
  return path.join(getDowncityAgentDirPath(cwd, agentId), "sessions");
}

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
 * Session 消息事实源文件路径。
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
 * Session 消息归档文件路径。
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
 * 任务运行目录路径。
 */
export function getDowncityTasksDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "task");
}

export function getDowncityDebugDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), ".debug");
}

/**
 * `.downcity/public` 公开资源目录路径。
 */
export function getDowncityPublicDirPath(cwd: string): string {
  return path.join(getDowncityDirPath(cwd), "public");
}
