/**
 * @downcity/agent — Agent 运行时公开 API。
 *
 * 关键点（中文）
 * - 这是 agent 包唯一稳定的公开入口。
 * - 只导出 Agent、plugin 作者 API、city 运行集成 API 与跨包协议类型。
 * - HTTP router、sandbox runner、内部 plugin runtime runner 等实现细节不从根入口暴露。
 */

// Agent 入口
export { Agent } from "./agent/local/Agent.js";
export { RemoteAgent } from "./agent/remote/RemoteAgent.js";
export { Session } from "./session/Session.js";
export type { SessionOptions } from "./types/session/SessionOptions.js";
export {
  inferAgentModelLabel,
  normalizeAgentModel,
} from "./model/CityModelAdapter.js";
export type {
  AgentArchiveSessionInput,
  AgentArchiveSessionsInput,
  AgentArchiveSessionResult,
  AgentArchiveSessionsResult,
  AgentCleanArchiveResult,
  AgentSessions,
  AgentModel,
  AgentManagedSession,
  AgentSessionActor,
  AgentSession,
  AgentSessionConstructor,
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentOptions,
  RemoteAgentOptions,
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionRecordsInput,
  AgentSessionRecordsPage,
  AgentSessionRecordsView,
  AgentSessionInfo,
  AgentSessionSetInput,
  AgentSessionSummary,
  AgentSessionSummaryPage,
  AgentSessionSystemBlock,
  AgentSessionSystemBlockSource,
  AgentSessionSystemSessionInfo,
  AgentSessionSystemSnapshot,
  AgentSessionTimelineEvent,
  RemoteAgentPluginActionInput,
  RemoteAgentPluginActionResult,
  RemoteAgentSession,
} from "./types/agent/AgentTypes.js";
export type {
  AgentSessionEvent,
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "./types/sdk/AgentSessionEvent.js";
export type {
  AgentSessionActionCallback,
  AgentSessionActionEvent,
  AgentSessionActionRecord,
  AgentSessionActionState,
} from "./types/sdk/AgentSessionAction.js";
export type { AgentSessionPromptInput, SessionUserMessagePart } from "./types/sdk/AgentSessionPrompt.js";
export type { AgentSessionStopResult } from "./types/sdk/AgentSessionStop.js";
export type {
  AgentSessionTurnHandle,
  AgentSessionTurnResult,
} from "./types/sdk/AgentSessionTurn.js";
export { AgentContext } from "./types/runtime/agent/AgentContext.js";
export type {
  AgentContextOptions,
  InvokePluginPort,
  SessionCollectionPort,
  SessionPort,
  StructuredConfig,
} from "./types/runtime/agent/AgentContext.js";

// Plugin 作者 API
export { BasePlugin } from "./plugin/core/BasePlugin.js";
export {
  createAction,
  createPlugin,
} from "./plugin/core/PluginActionFactory.js";
export type {
  CreatePluginActionOptions,
  CreatePluginOptions,
} from "./plugin/core/PluginActionFactory.js";

// Session 与即时执行集成
export { Executor } from "./executor/Executor.js";
export {
  drainDeferredPersistedUserMessages,
  getSessionRunScope,
} from "./executor/SessionRunScope.js";
export { JsonlSessionHistoryComposer } from "./executor/composer/history/jsonl/JsonlSessionHistoryComposer.js";
export { LocalSessionContextComposer } from "./executor/composer/context/LocalSessionContextComposer.js";
export { JsonlSessionHistoryStore } from "./executor/store/history/jsonl/JsonlSessionHistoryStore.js";
export { JsonlSessionCompactionComposer } from "./executor/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
export type {
  SessionCompactionComposer,
  SessionCompactionInput,
} from "./executor/composer/compaction/SessionCompactionComposer.js";
export type {
  SessionContextComposer,
  SessionContextComposeResult,
} from "./executor/composer/context/SessionContextComposer.js";
export type {
  SessionHistoryComposer,
  SessionHistoryPrepareInput,
} from "./executor/composer/history/SessionHistoryComposer.js";
export type { SessionSystemComposer } from "./executor/composer/system/SessionSystemComposer.js";
export type {
  SessionComposerFactoryContext,
  SessionComposerInput,
  SessionComposerOptions,
} from "./types/session/SessionComposerOptions.js";
export { transformPromptsIntoSystemMessages } from "./executor/composer/system/default/PromptRenderer.js";
export {
  loadStaticSystemPrompts,
  StaticPromptCatalog,
} from "./executor/composer/system/default/StaticPromptCatalog.js";

// 通用 plugin 宿主工具
export {
  buildStaticPluginAvailability,
  findPluginByName,
  hasPluginLifecycle,
  listPluginViews,
  listPluginsWithLifecycle,
  listPluginsWithoutLifecycle,
  resolvePluginAvailability,
  toPluginView,
} from "./plugin/core/PluginCatalog.js";
export {
  listPluginAuthPolicies,
  registerPluginHttpRoutes,
} from "./plugin/core/PluginHttpRoutes.js";
export {
  createLocalPluginCommandContext,
  getLocalPluginAvailability,
  runLocalPluginAction,
} from "./plugin/core/PluginLocalExecution.js";
export {
  registerPluginActionCommandsForCli,
} from "./plugin/core/PluginCommand.js";

// Runtime plugin 调度集成
export { ActionScheduleStore } from "./plugin/core/ActionScheduleStore.js";
export { parseActionScheduleRunAtMsOrThrow } from "./plugin/core/ActionScheduleTime.js";
export {
  pickLastSuccessfulChatSendText,
  resolveAssistantMessageForPersistence,
} from "./executor/messages/UserVisibleText.js";

// 项目与配置集成
export {
  initializeAgentProject,
  isAgentProjectInitialized,
  normalizeDefaultAgentId,
} from "./config/AgentInitializer.js";
export { loadDowncityConfig } from "./config/Config.js";
export {
  ensureRuntimeProjectReady,
} from "./agent/local/ProjectSetup.js";
export { assertProjectExecutionTarget } from "./config/ExecutionBinding.js";

// 日志
export { getLogger, logger, type Logger } from "./utils/logger/Logger.js";

// 宿主端口类型
export type {
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "./types/agent/AgentRuntimeAssembly.js";

// 项目协议类型
export type {
  AgentProjectChannel,
  AgentProjectInitializationInput,
  AgentProjectInitializationResult,
} from "./types/config/AgentProject.js";
export type { ExecutionBindingConfig } from "./types/config/ExecutionBinding.js";

// 配置与模型类型
export type { DowncityConfig } from "./types/config/DowncityConfig.js";
export type {
  LlmConfig,
  LlmModelConfig,
  LlmProviderConfig,
  LlmProviderType,
} from "./types/config/LlmConfig.js";

// JSON 基础类型
export type { JsonObject, JsonPrimitive, JsonValue } from "./types/common/Json.js";

// Platform / city 控制面协议类型
export type {
  ControlPlaneRuntimeMeta,
  ControlPlaneRuntimeStatus,
  ManagedAgentProcessView,
  ManagedAgentRegistryEntry,
  ManagedAgentRegistryV1,
  PlatformAgentDirectoryInspection,
  PlatformAgentOption,
  PlatformAgentsResponse,
  PlatformConfigFileStatusItem,
  PlatformConfigStatusResponse,
  PlatformLocalModelsResponse,
} from "./types/runtime/platform/Platform.js";

export type {
  PlatformAgentChatChannelStatus,
  PlatformAgentShipChatChannelsConfig,
  PlatformAgentShipChatPluginConfig,
  PlatformAgentShipExecutionAgentConfig,
  PlatformAgentShipExecutionConfig,
  PlatformAgentShipJson,
  PlatformAgentShipPluginsConfig,
  PlatformAgentShipSingleChannelConfig,
  PlatformAgentShipStartConfig,
} from "./types/runtime/platform/PlatformGateway.js";

// Inline instant 协议类型
export type {
  InlineInstantExecutorType,
  PlatformInlineInstantRunInput,
  PlatformInlineInstantRunResult,
  PlatformInlineInstantRunner,
} from "./types/runtime/http/InlineInstant.js";

// Plugin 作者与控制面类型
export type {
  Plugin,
  PluginAction,
  PluginActionApi,
  PluginActionCommand,
  PluginActionCommandInput,
  PluginActionExample,
  PluginActionInputSchema,
  PluginActionMetadata,
  PluginActionResult,
  PluginActions,
  PluginAvailability,
  PluginConfigDefinition,
  PluginEffectHook,
  PluginGuardHook,
  PluginHooks,
  PluginHttpDefinition,
  PluginPipelineHook,
  AgentPlugins,
  PluginResolveHook,
  PluginHttpRegistration,
  PluginActionInvokeParams,
  PluginActionInvokePort,
  PluginActionInvokeResult,
  PluginSetupDefinition,
  PluginSetupField,
  PluginSetupFieldOption,
  PluginUsageDefinition,
  PluginUsageField,
  PluginUsageFieldOption,
  PluginView,
} from "./plugin/types/Plugin.js";
export type {
  PluginActionResponse,
  PluginCatalogResponse,
  PluginAvailabilityResponse,
  PluginAvailabilityView,
} from "./plugin/types/PluginApi.js";

// 主动型 plugin 与 CLI/control 协议类型
export type {
  PluginCommandResult,
  PluginLifecycle,
  PluginState,
} from "./plugin/types/Plugin.js";
export type {
  ActionScheduleJobRecord,
  ActionScheduleJobStatus,
  CreateActionScheduleJobInput,
  PluginActionScheduleInput,
} from "./plugin/types/ActionSchedule.js";
export type {
  PluginCliBaseOptions,
  PluginCommandResponse,
  PluginControlAction,
  PluginControlResponse,
  PluginStateListResponse,
  PluginStateView,
} from "./plugin/types/Plugins.js";
export type {
  PluginStateControlAction,
  PluginStateControlResult,
  PluginStateSnapshot,
} from "./plugin/core/Manager.js";

// Platform store 类型
export type {
  StoredChannelAccount,
  StoredChannelAccountChannel,
  StoredEnvEntry,
  StoredGlobalEnvEntry,
  UpsertChannelAccountInput,
  UpsertEnvEntryInput,
  UpsertGlobalEnvEntryInput,
} from "./types/platform/Store.js";

// HTTP auth 协议类型
export {
  AUTH_DEFAULT_ROLE_NAMES,
  AUTH_DEFAULT_ROLES,
  AUTH_PERMISSION_DESCRIPTIONS,
  AUTH_PERMISSION_KEYS,
} from "./types/runtime/auth/AuthPermission.js";
export type {
  AuthDefaultRoleDefinition,
  AuthDefaultRoleName,
  AuthPermissionKey,
} from "./types/runtime/auth/AuthPermission.js";
export type { AuthRoutePolicy } from "./types/runtime/auth/AuthRoute.js";
export type {
  AuthIssuedToken,
  AuthTokenSummary,
} from "./types/runtime/auth/AuthToken.js";
export type {
  AuthAuditLog,
  AuthPermission,
  AuthPrincipal,
  AuthRole,
  AuthTokenRecord,
  AuthUser,
  AuthUserStatus,
} from "./types/runtime/auth/AuthTypes.js";
