/**
 * Session 模块聚合入口。
 *
 * 职责说明（中文）
 * - 统一暴露 `session/` 目录下的本地 Session 实现与相关辅助能力。
 * - 让 `Session` 相关代码收敛在一个目录树中，避免实现散落在 Agent 入口模块里。
 */

export { Session } from "./Session.js";

export {
  getSdkAgentDirPath,
  getSdkAgentRpcEndpointPath,
  getSdkAgentSessionArchiveDirPath,
  getSdkAgentSessionDirPath,
  getSdkAgentSessionMessagesDirPath,
  getSdkAgentSessionMessagesPath,
  getSdkAgentSessionMetaPath,
  getSdkAgentSessionsRootDirPath,
  getSdkAgentsRootDirPath,
  getSdkDowncityDirPath,
} from "./storage/Paths.js";
export {
  inferModelLabel,
  patchSessionModelLabel,
  readSessionMetadata,
  resolveSystemTimezone,
  writeSessionMetadata,
} from "./storage/Metadata.js";
export {
  persistSdkAssistantResult,
  touchSessionMetadata,
} from "./storage/Persistence.js";
export {
  createRuntimeSessionPort,
} from "./storage/RuntimeSessionPort.js";
export {
  buildSessionHistoryPage,
  buildSessionInfo,
  listAgentSessionSummaryPage,
  loadSessionMessagesFromPath,
  resolveSessionMessagePreview,
  resolveSessionTitle,
  toSessionTimelineEvents,
} from "./browse/Browse.js";
