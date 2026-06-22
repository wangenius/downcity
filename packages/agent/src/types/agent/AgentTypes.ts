/**
 * Agent 对外类型 facade。
 *
 * 关键点（中文）
 * - 保留旧的 `@/types/agent/AgentTypes.js` 导入路径。
 * - 真实类型按职责拆到 AgentOptions / RemoteAgentOptions / SessionTypes / SessionActor。
 * - 这里不承载具体字段定义，避免单文件继续膨胀。
 */

export type { AgentModel } from "@/model/CityModelAdapter.js";
export type {
  SessionComposerFactoryContext,
  SessionComposerInput,
  SessionComposerOptions,
} from "@/types/session/SessionComposerOptions.js";
export type {
  AgentManagedSession,
  SessionOptions,
} from "@/types/session/SessionOptions.js";
export type {
  AgentOptions,
  AgentSessionConstructor,
} from "@/types/agent/AgentOptions.js";
export type { RemoteAgentOptions } from "@/types/agent/RemoteAgentOptions.js";
export type {
  RemoteAgentPluginActionInput,
  RemoteAgentPluginActionResult,
} from "@/types/agent/RemoteAgentPluginAction.js";
export type {
  AgentArchiveSessionInput,
  AgentArchiveSessionsInput,
  AgentArchiveSessionResult,
  AgentArchiveSessionsResult,
  AgentCleanArchiveResult,
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionHistoryView,
  AgentSessionInfo,
  AgentSessionSetInput,
  AgentSessionSummary,
  AgentSessionSummaryPage,
  AgentSessionSystemBlock,
  AgentSessionSystemBlockSource,
  AgentSessionSystemSessionInfo,
  AgentSessionSystemSnapshot,
  AgentSessionTimelineEvent,
} from "@/types/agent/SessionTypes.js";
export type { AgentSessionStopResult } from "@/types/sdk/AgentSessionStop.js";
export type {
  AgentSession,
  AgentSessionActor,
  AgentSessionCollection,
  RemoteAgentSession,
} from "@/types/agent/SessionActor.js";
