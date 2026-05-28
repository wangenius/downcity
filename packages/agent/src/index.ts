/**
 * @downcity/agent — Agent 运行时公开 API。
 *
 * 关键点（中文）
 * - 这是 agent 包唯一稳定的公开入口。
 * - 只导出 Agent、plugin 作者 API、city 运行集成 API 与跨包协议类型。
 * - HTTP router、sandbox runner、内部 plugin runtime runner 等实现细节不从根入口暴露。
 */

// Agent 入口
export { Agent } from "./agent/Agent.js";
export { RemoteAgent } from "./agent/RemoteAgent.js";
export type {
  AgentSessionCollection,
  AgentSessionActor,
  AgentSession,
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentOptions,
  AgentHttpBinding,
  AgentHttpStartOptions,
  AgentRpcBinding,
  AgentStartOptions,
  AgentStartResult,
  AgentStopResult,
  RemoteAgentOptions,
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
  RemoteAgentSession,
} from "./types/agent/AgentTypes.js";
export type {
  AgentSessionEvent,
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "./types/sdk/AgentSessionEvent.js";
export type { AgentSessionPromptInput } from "./types/sdk/AgentSessionPrompt.js";
export type {
  AgentSessionTurnHandle,
  AgentSessionTurnResult,
} from "./types/sdk/AgentSessionTurn.js";
export type { AgentRuntime, AgentRuntimeBase } from "./types/runtime/agent/AgentRuntime.js";
export type {
  AgentContext,
  InvokePluginPort,
  SessionCollectionPort,
  SessionPort,
  StructuredConfig,
} from "./types/runtime/agent/AgentContext.js";

// Plugin 作者 API
export { BasePlugin } from "./plugin/core/BasePlugin.js";

// Session 与即时执行集成
export { Executor } from "./executor/Executor.js";
export {
  drainDeferredPersistedUserMessages,
  getSessionRunScope,
} from "./executor/SessionRunScope.js";
export { JsonlSessionHistoryComposer } from "./executor/composer/history/jsonl/JsonlSessionHistoryComposer.js";
export { JsonlSessionHistoryStore } from "./executor/store/history/jsonl/JsonlSessionHistoryStore.js";
export { JsonlSessionCompactionComposer } from "./executor/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
export type { SessionSystemComposer } from "./executor/composer/system/SessionSystemComposer.js";
export { transformPromptsIntoSystemMessages } from "./executor/composer/system/default/PromptRenderer.js";
export {
  loadStaticSystemPrompts,
  StaticPromptCatalog,
} from "./executor/composer/system/default/StaticPromptCatalog.js";
export { shellTools } from "./executor/tools/shell/ShellToolDefinition.js";

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

// Agent server 与 transport 集成
export { startServer } from "./runtime/server/http/Server.js";
export { startLocalRpcServer } from "./runtime/server/rpc/Server.js";
export { callAgentTransport } from "./runtime/transport/rpc/Transport.js";

// Runtime plugin 运行集成
export {
  startAllPlugins,
  stopAllPlugins,
} from "./plugin/core/Manager.js";
export { ActionScheduleStore } from "./plugin/core/ActionScheduleStore.js";
export { parseActionScheduleRunAtMsOrThrow } from "./plugin/core/ActionScheduleTime.js";
export {
  pickLastSuccessfulChatSendText,
  resolveAssistantMessageForPersistence,
} from "./executor/messages/UserVisibleText.js";

// Plugin 与权限配置集成
export { persistProjectPluginConfig } from "./plugin/core/ProjectConfigStore.js";

// 项目与配置集成
export {
  initializeAgentProject,
  isAgentProjectInitialized,
  normalizeDefaultAgentName,
} from "./config/AgentInitializer.js";
export { loadDowncityConfig } from "./config/Config.js";
export {
  ensureRuntimeProjectReady,
} from "./runtime/host/daemon/ProjectSetup.js";
export { assertProjectExecutionTarget } from "./config/ExecutionBinding.js";

// 日志
export { getLogger, logger, type Logger } from "./utils/logger/Logger.js";

// 宿主端口类型
export type {
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "./types/runtime/host/AgentHost.js";

// 项目协议类型
export type {
  AgentProjectChannel,
  AgentProjectInitializationInput,
  AgentProjectInitializationResult,
} from "./types/config/AgentProject.js";
export type { ExecutionBindingConfig } from "./types/config/ExecutionBinding.js";
export type { StartOptions } from "./types/config/Start.js";

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
  PlatformAgentDaemonMeta,
  PlatformAgentShipChatChannelsConfig,
  PlatformAgentShipChatPluginConfig,
  PlatformAgentShipExecutionAgentConfig,
  PlatformAgentShipExecutionConfig,
  PlatformAgentShipJson,
  PlatformAgentShipPluginsConfig,
  PlatformAgentShipSingleChannelConfig,
  PlatformAgentShipStartConfig,
} from "./types/runtime/platform/PlatformGateway.js";

// Daemon / RPC 协议类型
export {
  DAEMON_LOG_FILENAME,
  DAEMON_META_FILENAME,
  DAEMON_PID_FILENAME,
} from "./types/runtime/daemon/Daemon.js";
export type {
  DaemonMeta,
  DaemonStaleReason,
} from "./types/runtime/daemon/Daemon.js";
export type {
  LocalRpcRequest,
  LocalRpcResponse,
} from "./types/runtime/rpc/LocalRpc.js";

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
  PluginActionResult,
  PluginActions,
  PluginAvailability,
  PluginConfigDefinition,
  PluginEffectHook,
  PluginGuardHook,
  PluginHooks,
  PluginHttpDefinition,
  PluginPipelineHook,
  PluginPort,
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
  StoredAgentEnvEntry,
  StoredChannelAccount,
  StoredChannelAccountChannel,
  StoredEnvEntry,
  StoredEnvScope,
  StoredGlobalEnvEntry,
  StoredModel,
  StoredModelProvider,
  StoredProviderMeta,
  UpsertAgentEnvEntryInput,
  UpsertChannelAccountInput,
  UpsertEnvEntryInput,
  UpsertGlobalEnvEntryInput,
  UpsertModelInput,
  UpsertModelProviderInput,
} from "./types/runtime/host/Store.js";

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
