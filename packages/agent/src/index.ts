/**
 * @downcity/agent — Agent 运行时公开 API。
 *
 * 关键点（中文）
 * - 这是 agent 包唯一稳定的公开入口。
 * - 只导出 SDK、插件/服务作者 API、city 运行集成 API 与跨包协议类型。
 * - HTTP router、sandbox runner、内部 service runner 等实现细节不从根入口暴露。
 */

// SDK 入口
export { Agent } from "./sdk/Agent.js";
export { Session } from "./sdk/Session.js";
export { RemoteAgent } from "./sdk/RemoteAgent.js";
export { AgentCore } from "./core/AgentCore.js";
export type {
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
  AgentSessionRunInput,
  AgentSessionRunResult,
  AgentSessionSetInput,
  AgentSessionStreamEvent,
  AgentSessionSystemBlock,
  AgentSessionSystemBlockSource,
  AgentSessionSystemSessionInfo,
  AgentSessionSystemSnapshot,
} from "./sdk/AgentSdkTypes.js";
export type {
  AgentRuntime as AgentCoreRuntime,
  AgentRuntimeBase as AgentCoreRuntimeBase,
} from "./core/AgentCoreTypes.js";
export type {
  AgentContext as AgentContext,
  AgentContext as AgentCoreContext,
  ChatRuntimePort,
  InvokeServicePort,
  SessionCollectionPort,
  SessionPort,
  StructuredConfig,
} from "./core/AgentContextTypes.js";

// 服务与插件作者 API
export { BaseService } from "./service/builtins/BaseService.js";
export { ChatService } from "./service/builtins/chat/ChatService.js";
export { ChatChannelAccountService } from "./service/builtins/chat/accounts/ChannelAccountService.js";
export type { ChatChannelAccountListItem } from "./service/builtins/chat/types/ChannelAccount.js";
export type {
  ChatServiceChannelAccountProvider,
  ChatServiceFeishuOptions,
  ChatServiceOptions,
  ChatServiceQqOptions,
  ChatServiceTelegramOptions,
} from "./service/builtins/chat/ChatServiceTypes.js";
export { authPlugin } from "./plugin/builtins/auth/Plugin.js";
export { skillPlugin } from "./plugin/builtins/skill/Plugin.js";
export { webPlugin } from "./plugin/builtins/web/Plugin.js";
export { asrPlugin } from "./plugin/builtins/asr/Plugin.js";
export { ttsPlugin } from "./plugin/builtins/tts/Plugin.js";
export { workboardPlugin } from "./plugin/builtins/workboard/Plugin.js";

// Session 与即时执行集成
export { Executor } from "./session/Executor.js";
export {
  drainDeferredPersistedUserMessages,
  getSessionRunScope,
} from "./session/SessionRunScope.js";
export { JsonlSessionHistoryComposer } from "./session/composer/history/jsonl/JsonlSessionHistoryComposer.js";
export { JsonlSessionCompactionComposer } from "./session/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
export { SessionSystemComposer } from "./session/composer/system/SessionSystemComposer.js";
export { transformPromptsIntoSystemMessages } from "./session/composer/system/default/PromptRenderer.js";
export {
  loadStaticSystemPrompts,
  StaticPromptCatalog,
} from "./session/composer/system/default/StaticPromptCatalog.js";

// Agent server 与 transport 集成
export { startServer } from "./server/http/Server.js";
export { startLocalRpcServer } from "./server/rpc/Server.js";
export { callAgentTransport } from "./transport/rpc/Transport.js";

// Service 运行集成
export { listRegisteredServices } from "./service/core/ServiceClassRegistry.js";
export {
  startAllServices,
  stopAllServices,
} from "./service/core/Manager.js";
export { ServiceScheduleStore } from "./service/core/schedule/Store.js";
export { parseScheduledRunAtMsOrThrow } from "./service/core/schedule/Time.js";
export {
  pickLastSuccessfulChatSendText,
  resolveAssistantMessageForPersistence,
} from "./service/builtins/chat/runtime/UserVisibleText.js";

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

// 项目、配置与模型集成
export { createModel } from "./model/CreateModel.js";
export {
  initializeAgentProject,
  isAgentProjectInitialized,
  listPlatformModelChoices,
  normalizeDefaultAgentName,
} from "./project/AgentInitializer.js";
export type { PlatformModelChoice } from "./project/AgentInitializer.js";
export {
  ensureRuntimeExecutionBindingReady,
  ensureRuntimeProjectReady,
} from "./host/daemon/ProjectSetup.js";
export { assertProjectExecutionTarget } from "./config/ExecutionBinding.js";

// 日志
export { getLogger, logger, type Logger } from "./utils/logger/Logger.js";

// 宿主端口类型
export type {
  AgentPathRuntime,
  AgentPlatformRuntime,
  AgentPluginConfigRuntime,
} from "./types/host/AgentHost.js";

// 项目协议类型
export type {
  AgentProjectChannel,
  AgentProjectInitializationInput,
  AgentProjectInitializationResult,
} from "./project/types/AgentProject.js";
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
} from "./types/platform/Platform.js";
export type {
  PlatformAgentChatChannelStatus,
  PlatformAgentDaemonMeta,
  PlatformAgentShipChatChannelsConfig,
  PlatformAgentShipExecutionAgentConfig,
  PlatformAgentShipExecutionConfig,
  PlatformAgentShipJson,
  PlatformAgentShipServicesConfig,
  PlatformAgentShipSingleChannelConfig,
  PlatformAgentShipStartConfig,
} from "./types/platform/PlatformGateway.js";

// Daemon / RPC 协议类型
export {
  DAEMON_LOG_FILENAME,
  DAEMON_META_FILENAME,
  DAEMON_PID_FILENAME,
} from "./types/daemon/Daemon.js";
export type { DaemonMeta, DaemonStaleReason } from "./types/daemon/Daemon.js";
export type {
  LocalRpcRequest,
  LocalRpcResponse,
} from "./types/rpc/LocalRpc.js";

// Inline instant 协议类型
export type {
  InlineInstantExecutorType,
  PlatformInlineInstantRunInput,
  PlatformInlineInstantRunResult,
  PlatformInlineInstantService,
} from "./types/http/InlineInstant.js";

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
  PluginServiceInvokeParams,
  PluginServiceInvokePort,
  PluginServiceInvokeResult,
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
  PluginCliBaseOptions,
  PluginListResponse,
} from "./plugin/types/PluginApi.js";

// Service 作者与 CLI/control 协议类型
export type {
  Service,
  ServiceAction,
  ServiceActionCommand,
  ServiceActionCommandInput,
  ServiceActionResult,
  ServiceActions,
  ServiceCommandResult,
  ServiceLifecycle,
  ServiceState,
} from "./service/types/Service.js";
export type {
  CreateScheduledJobInput,
  ScheduledJobRecord,
  ScheduledJobStatus,
  ServiceCommandScheduleInput,
} from "./service/types/ServiceSchedule.js";
export type {
  ServiceCliBaseOptions,
  ServiceCommandResponse,
  ServiceControlAction,
  ServiceControlResponse,
  ServiceListResponse,
  ServiceStateView,
} from "./service/types/Services.js";
export type {
  ServiceStateControlAction,
  ServiceStateControlResult,
  ServiceStateSnapshot,
} from "./service/core/Manager.js";

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
} from "./types/host/Store.js";

// HTTP auth 协议类型
export {
  AUTH_DEFAULT_ROLE_NAMES,
  AUTH_DEFAULT_ROLES,
  AUTH_PERMISSION_DESCRIPTIONS,
  AUTH_PERMISSION_KEYS,
} from "./types/auth/AuthPermission.js";
export type {
  AuthDefaultRoleDefinition,
  AuthDefaultRoleName,
  AuthPermissionKey,
} from "./types/auth/AuthPermission.js";
export type { AuthRoutePolicy } from "./types/auth/AuthRoute.js";
export type {
  AuthIssuedToken,
  AuthTokenSummary,
} from "./types/auth/AuthToken.js";
export type {
  AuthAuditLog,
  AuthPermission,
  AuthPrincipal,
  AuthRole,
  AuthTokenRecord,
  AuthUser,
  AuthUserStatus,
} from "./types/auth/AuthTypes.js";
