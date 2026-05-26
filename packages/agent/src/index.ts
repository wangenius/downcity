/**
 * @downcity/agent — Agent 运行时公开 API。
 *
 * 关键点（中文）
 * - 这是 agent 包唯一稳定的公开入口。
 * - 只导出 SDK、plugin 作者 API、city 运行集成 API 与跨包协议类型。
 * - HTTP router、sandbox runner、内部 runtime plugin runner 等实现细节不从根入口暴露。
 */

// SDK 入口
export { Agent } from "./sdk/Agent.js";
export { Session } from "./sdk/Session.js";
export { RemoteAgent } from "./sdk/RemoteAgent.js";
export { AgentCore } from "./core/AgentCore.js";
export type {
  AgentMode,
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
  AgentSessionMetadata,
  AgentSessionSetInput,
  AgentSessionSystemBlock,
  AgentSessionSystemBlockSource,
  AgentSessionSystemSessionInfo,
  AgentSessionSystemSnapshot,
} from "./sdk/AgentSdkTypes.js";
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
export type { AgentRuntime, AgentRuntimeBase } from "./core/AgentCoreTypes.js";
export type {
  AgentContext,
  ChatRuntimePort,
  InvokePluginPort,
  SessionCollectionPort,
  SessionPort,
  StructuredConfig,
} from "./core/AgentContextTypes.js";

// Plugin 作者 API
export { BasePlugin } from "./plugin/core/BasePlugin.js";
export { ChatPlugin } from "./plugin/builtins/chat/ChatPlugin.js";
export { ChatChannelAccountService } from "./plugin/builtins/chat/accounts/ChannelAccountService.js";
export type { ChatChannelAccountListItem } from "./plugin/builtins/chat/types/ChannelAccount.js";
export type {
  ChatPluginChannelAccountProvider,
  ChatPluginFeishuOptions,
  ChatPluginOptions,
  ChatPluginQqOptions,
  ChatPluginTelegramOptions,
} from "./plugin/builtins/chat/ChatPluginTypes.js";
export { AuthPlugin } from "./plugin/builtins/auth/Plugin.js";
export { SkillPlugin } from "./plugin/builtins/skill/Plugin.js";
export { WebPlugin } from "./plugin/builtins/web/Plugin.js";
export { AsrPlugin } from "./plugin/builtins/asr/Plugin.js";
export { TtsPlugin } from "./plugin/builtins/tts/Plugin.js";
export { WorkboardPlugin } from "./plugin/builtins/workboard/Plugin.js";

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

// Agent server 与 transport 集成
export { startServer } from "./runtime/server/http/Server.js";
export { startLocalRpcServer } from "./runtime/server/rpc/Server.js";
export { callAgentTransport } from "./runtime/transport/rpc/Transport.js";

// Runtime plugin 运行集成
export { listRegisteredPlugins } from "./plugin/core/PluginClassRegistry.js";
export {
  startAllPlugins,
  stopAllPlugins,
} from "./plugin/core/Manager.js";
export { PluginScheduleStore } from "./plugin/core/schedule/Store.js";
export { parseScheduledRunAtMsOrThrow } from "./plugin/core/schedule/Time.js";
export {
  pickLastSuccessfulChatSendText,
  resolveAssistantMessageForPersistence,
} from "./plugin/builtins/chat/runtime/UserVisibleText.js";

// Plugin 与权限配置集成
export {
  listChatAuthorizationRoles,
  readChatAuthorizationConfigSync,
  setChatAuthorizationUserRole,
} from "./plugin/builtins/auth/runtime/AuthorizationConfig.js";
export { resolveAuthorizedUserRole } from "./plugin/builtins/auth/runtime/AuthorizationPolicy.js";
export {
  buildStaticPluginAvailability,
  findBuiltinPlugin,
  findStaticPluginView,
  listStaticPluginViews,
} from "./plugin/core/Catalog.js";
export { runLocalPluginAction } from "./plugin/core/LocalExecution.js";
export { registerAllPluginsForCli } from "./plugin/core/PluginCommand.js";
export { listBuiltinPluginRuntimeAuthPolicies } from "./plugin/core/HttpRoutes.js";
export { persistProjectPluginConfig } from "./plugin/core/ProjectConfigStore.js";

// 项目与配置集成
export {
  initializeAgentProject,
  isAgentProjectInitialized,
  listPlatformModelChoices,
  normalizeDefaultAgentName,
} from "./config/project/AgentInitializer.js";
export type { PlatformModelChoice } from "./config/project/AgentInitializer.js";
export {
  ensureRuntimeExecutionBindingReady,
  ensureRuntimeProjectReady,
} from "./runtime/host/daemon/ProjectSetup.js";
export { assertProjectExecutionTarget } from "./config/ExecutionBinding.js";

// 日志
export { getLogger, logger, type Logger } from "./utils/logger/Logger.js";

// 宿主端口类型
export type {
  AgentPathRuntime,
  AgentPlatformRuntime,
  AgentPluginConfigRuntime,
} from "./types/runtime/host/AgentHost.js";

// 项目协议类型
export type {
  AgentProjectChannel,
  AgentProjectInitializationInput,
  AgentProjectInitializationResult,
} from "./config/project/types/AgentProject.js";
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
  PlatformInlineInstantService,
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
  PluginRuntimeHttpRegistration,
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
  CreateScheduledJobInput,
  ScheduledJobRecord,
  ScheduledJobStatus,
  PluginCommandScheduleInput,
} from "./plugin/types/PluginSchedule.js";
export type {
  PluginCliBaseOptions,
  PluginCommandResponse,
  PluginControlAction,
  PluginControlResponse,
  PluginListResponse,
  PluginStateView,
} from "./plugin/types/Plugins.js";
export type {
  PluginStateControlAction,
  PluginStateControlResult,
  PluginStateSnapshot,
} from "./plugin/core/Manager.js";

// Chat authorization plugin 协议类型
export {
  CHAT_AUTHORIZATION_CHANNELS,
  createDefaultChatAuthorizationRoles,
  isChatAuthorizationChannel,
} from "./plugin/builtins/auth/types/AuthPlugin.js";
export type {
  AuthObservePrincipalPayload,
  AuthObservePrincipalResult,
  AuthResolveUserRolePayload,
  AuthSetUserRolePayload,
  AuthWriteConfigPayload,
  ChatAuthorizationCatalog,
  ChatAuthorizationChannel,
  ChatAuthorizationConfig,
  ChatAuthorizationDecision,
  ChatAuthorizationEvaluateInput,
  ChatAuthorizationEvaluateResult,
  ChatAuthorizationObservedChat,
  ChatAuthorizationObservedUser,
  ChatAuthorizationPermission,
  ChatAuthorizationPermissionMeta,
  ChatAuthorizationRole,
  ChatAuthorizationSnapshot,
  ChatAuthorizationStateFile,
  ChatChannelAuthorizationConfig,
} from "./plugin/builtins/auth/types/AuthPlugin.js";

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
