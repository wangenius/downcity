/**
 * SDK Session 辅助模块聚合入口。
 *
 * 关键点（中文）
 * - 这里收口 `Session.ts` 依赖的路径、元数据、持久化与 runtime plugin 端口适配能力。
 * - 避免这些实现继续平铺在 `sdk/` 顶层，提升目录语义清晰度。
 */

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
} from "./Paths.js";
export {
  inferModelLabel,
  patchSessionModelLabel,
  readSessionMetadata,
  resolveSystemTimezone,
  writeSessionMetadata,
} from "./Metadata.js";
export {
  persistSdkAssistantResult,
  touchSessionMetadata,
} from "./Persistence.js";
export {
  createRuntimeSessionPort,
} from "./RuntimeSessionPort.js";
