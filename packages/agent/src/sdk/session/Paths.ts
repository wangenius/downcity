/**
 * SDK Session 路径规则。
 *
 * 关键点（中文）
 * - 与旧 `.downcity/session/<sessionId>` 路径分开，避免不同 agent 在同一项目目录下互相污染。
 * - 新 SDK 统一落盘到 `.downcity/agents/<agentId>/sessions/<sessionId>/...`。
 */

import path from "node:path";

/**
 * `.downcity` 根目录路径。
 */
export function getSdkDowncityDirPath(projectRoot: string): string {
  return path.join(projectRoot, ".downcity");
}

/**
 * SDK agents 根目录路径。
 */
export function getSdkAgentsRootDirPath(projectRoot: string): string {
  return path.join(getSdkDowncityDirPath(projectRoot), "agents");
}

/**
 * 单个 agent 根目录路径。
 */
export function getSdkAgentDirPath(
  projectRoot: string,
  agentId: string,
): string {
  return path.join(
    getSdkAgentsRootDirPath(projectRoot),
    encodeURIComponent(String(agentId || "").trim()),
  );
}

/**
 * 单个 agent 的 sessions 根目录路径。
 */
export function getSdkAgentSessionsRootDirPath(
  projectRoot: string,
  agentId: string,
): string {
  return path.join(getSdkAgentDirPath(projectRoot, agentId), "sessions");
}

/**
 * 单个 session 根目录路径。
 */
export function getSdkAgentSessionDirPath(
  projectRoot: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getSdkAgentSessionsRootDirPath(projectRoot, agentId),
    encodeURIComponent(String(sessionId || "").trim()),
  );
}

/**
 * 单个 session 的消息目录路径。
 */
export function getSdkAgentSessionMessagesDirPath(
  projectRoot: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getSdkAgentSessionDirPath(projectRoot, agentId, sessionId),
    "messages",
  );
}

/**
 * 单个 session 的消息 JSONL 文件路径。
 */
export function getSdkAgentSessionMessagesPath(
  projectRoot: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getSdkAgentSessionMessagesDirPath(projectRoot, agentId, sessionId),
    "messages.jsonl",
  );
}

/**
 * 单个 session 的 meta.json 路径。
 */
export function getSdkAgentSessionMetaPath(
  projectRoot: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getSdkAgentSessionMessagesDirPath(projectRoot, agentId, sessionId),
    "meta.json",
  );
}

/**
 * 单个 session 的 archive 目录路径。
 */
export function getSdkAgentSessionArchiveDirPath(
  projectRoot: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(
    getSdkAgentSessionMessagesDirPath(projectRoot, agentId, sessionId),
    "archive",
  );
}

/**
 * 单个 agent 的本地 RPC socket 路径。
 */
export function getSdkAgentRpcEndpointPath(
  projectRoot: string,
  agentId: string,
): string {
  return path.join(getSdkAgentDirPath(projectRoot, agentId), "agent.rpc.sock");
}
