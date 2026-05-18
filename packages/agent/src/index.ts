/**
 * @downcity/agent — Agent 运行时公开 API。
 *
 * 关键点（中文）
 * - 这是 agent 包的唯一公开入口。
 * - city 包通过 `import { ... } from '@downcity/agent'` 使用代理运行时。
 */

// SDK 入口
export { Agent } from "./host/sdk/Agent.js";
export { RemoteAgent } from "./host/sdk/RemoteAgent.js";
export type {
  AgentOptions,
  RemoteAgentOptions,
  AgentSessionSetInput,
  AgentSessionConfigSnapshot,
  AgentSessionRunInput,
  AgentSessionRunResult,
  AgentSessionStreamEvent,
  AgentSessionMetadata,
  AgentSessionForkInput,
} from "./host/sdk/AgentSdkTypes.js";
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

// Agent 运行时
export {
  initAgentRuntime,
  stopAgentHotReload,
  getAgentContext,
  getAgentRuntime,
  getAgentRuntimeBase,
  setAgentRuntime,
  setAgentRuntimeBase,
  requireAgentModel,
} from "./agent/AgentRuntime.js";
export type { AgentRuntime, AgentRuntimeBase } from './agent/AgentRuntimeState.js';

// Agent 上下文
export { createAgentContext } from "./agent/AgentContext.js";
export type { AgentContext } from "./agent/AgentContextTypes.js";

// 会话
export { Session } from './session/Session.js';
export { getSessionRunScope, drainDeferredPersistedUserMessages } from "./session/SessionRunScope.js";
export { JsonlSessionHistoryComposer } from "./session/composer/history/jsonl/JsonlSessionHistoryComposer.js";
export { JsonlSessionCompactionComposer } from "./session/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
export { SessionSystemComposer } from "./session/composer/system/SessionSystemComposer.js";
export { transformPromptsIntoSystemMessages } from "./session/composer/system/default/PromptRenderer.js";
export { loadStaticSystemPrompts } from "./session/composer/system/default/StaticPromptCatalog.js";
export { LocalSessionExecutor } from "./session/executors/local/LocalSessionExecutor.js";

// HTTP 服务
export { startServer } from './http/Server.js';
export { executeRouter } from "./http/execute/execute.js";
export { healthRouter } from "./http/health/health.js";
export { pluginsRouter } from "./http/plugins/plugins.js";
export {
  ensureServiceActionRoutesRegistered,
  servicesRouter,
} from "./http/services/services.js";
export { staticRouter } from "./http/static/static.js";
export { controlRouter } from "./http/control/ControlRouter.js";
export { registerControlApiRoutes } from "./http/control/ControlApiRoutes.js";
export { registerControlAuthorizationRoutes } from "./http/control/ControlAuthorizationRoutes.js";
export { registerControlModelRoutes } from "./http/control/ModelRoutes.js";
export { registerControlOverviewRoutes } from "./http/control/OverviewRoutes.js";
export { registerControlSessionRoutes } from "./http/control/SessionRoutes.js";
export { registerControlTaskRoutes } from "./http/control/TaskRoutes.js";
export { executeBySessionId } from "./http/control/ExecuteBySession.js";

// RPC
export { startLocalRpcServer } from "./host/rpc/Server.js";
export { callAgentTransport } from "./host/rpc/Transport.js";

// 服务框架
export {
  invokeServiceAction,
  resolveServiceAction,
} from "./service/core/ServiceActionRunner.js";
export { listRegisteredServices } from "./service/core/ServiceClassRegistry.js";
export {
  controlServiceState,
  getServiceRootCommandNames,
  getStaticServices,
  isServiceRunning,
  listServiceStates,
  registerAllServicesForServer,
  runServiceCommand,
  startAllServices,
  stopAllServices,
} from "./service/core/Manager.js";
export type {
  ServiceStateControlAction,
  ServiceStateControlResult,
  ServiceStateSnapshot,
} from "./service/core/Manager.js";
export {
  startServiceScheduleRuntime,
  stopServiceScheduleRuntime,
} from './service/schedule/Runtime.js';
export { ServiceScheduleStore } from "./service/schedule/Store.js";
export { runDueScheduledJobs } from "./service/schedule/Executor.js";
export {
  normalizeRunAtMsOrThrow,
  parseScheduledRunAtMsOrThrow,
  parseScheduleTimeOptionOrThrow,
} from "./service/schedule/Time.js";
export {
  pickLastSuccessfulChatSendText,
  resolveAssistantMessageForPersistence,
} from "./service/builtins/chat/runtime/UserVisibleText.js";
export { logger, getLogger, type Logger } from "./shared/utils/logger/Logger.js";

// 共享协议类型与控制面常量
export * from "./shared/types/AgentHost.js";
export * from "./shared/types/AgentProject.js";
export * from "./shared/types/AuthPlugin.js";
export * from "./shared/types/Platform.js";
export * from "./shared/types/PlatformGateway.js";
export * from "./shared/types/Daemon.js";
export * from "./shared/types/DowncityConfig.js";
export * from "./shared/types/ExecutionBinding.js";
export * from "./shared/types/InlineInstant.js";
export * from "./shared/types/Json.js";
export * from "./shared/types/LlmConfig.js";
export * from "./shared/types/LocalRpc.js";
export * from "./shared/types/Plugin.js";
export type {
  PluginCliBaseOptions,
  PluginActionResponse,
  PluginAvailabilityResponse,
  PluginAvailabilityView,
  PluginListResponse,
} from "./shared/types/PluginApi.js";
export * from "./shared/types/Service.js";
export * from "./shared/types/ServiceSchedule.js";
export * from "./shared/types/Services.js";
export * from "./shared/types/Start.js";
export * from "./shared/types/Store.js";
export * from "./shared/types/PluginLifecycle.js";
export * from "./shared/types/auth/AuthPermission.js";
export * from "./shared/types/auth/AuthRoute.js";
export * from "./shared/types/auth/AuthToken.js";
export * from "./shared/types/auth/AuthTypes.js";

// 模型
export { createModel } from './model/CreateModel.js';

// 配置
export { loadDowncityConfig, loadGlobalEnvFromStore, loadAgentEnvSnapshot } from './config/Config.js';
export { getDowncityJsonPath } from './config/Paths.js';

// Agent 项目初始化
export {
  normalizeDefaultAgentName,
  listPlatformModelChoices,
  isAgentProjectInitialized,
  initializeAgentProject,
} from "./agent/project/AgentInitializer.js";
export type { PlatformModelChoice } from "./agent/project/AgentInitializer.js";
export {
  readProjectExecutionBinding,
  readProjectPrimaryModelId,
  hasProjectExecutionTarget,
  assertProjectExecutionTarget,
} from "./agent/project/ProjectExecutionBinding.js";
export {
  listChatAuthorizationRoles,
  readChatAuthorizationConfigSync,
  setChatAuthorizationUserRole,
} from "./plugins/auth/runtime/AuthorizationConfig.js";
export { resolveAuthorizedUserRole } from "./plugins/auth/runtime/AuthorizationPolicy.js";
export { authPlugin } from "./plugins/auth/Plugin.js";
export { skillPlugin } from "./plugins/skill/Plugin.js";
export { webPlugin } from "./plugins/web/Plugin.js";
export { asrPlugin } from "./plugins/asr/Plugin.js";
export { ttsPlugin } from "./plugins/tts/Plugin.js";
export { workboardPlugin } from "./plugins/workboard/Plugin.js";

// Agent 项目准备
export {
  ensureRuntimeProjectReady,
  ensureRuntimeExecutionBindingReady,
} from "./host/daemon/ProjectSetup.js";
export {
  buildStaticPluginAvailability,
  findBuiltinPlugin,
  findStaticPluginView,
  listBuiltinPlugins,
  listStaticPluginViews,
  toStaticPluginView,
} from "./plugin/Catalog.js";
export { runLocalPluginAction, listLocalPlugins, getLocalPluginAvailability } from "./plugin/LocalExecution.js";
export { registerAllPluginsForCli } from "./plugin/PluginCommand.js";
export { listBuiltinPluginRuntimeAuthPolicies } from "./plugin/HttpRoutes.js";
export { persistProjectPluginConfig } from "./plugin/ProjectConfigStore.js";

// 沙箱
export {
  spawnShellProcess,
  runSandboxCommand,
} from "./sandbox/SandboxRunner.js";
export {
  resolveSandboxConfig,
  resolveSandboxCwd,
} from "./sandbox/SandboxConfigResolver.js";
export { spawnMacOsSeatbeltSandbox } from "./sandbox/MacOsSeatbeltSandbox.js";
export type {
  SandboxSessionStatus,
  SandboxSessionSnapshot,
  SandboxOutputChunk,
  SandboxExecRequest,
  SandboxStartRequest,
  SandboxReadRequest,
  SandboxWriteRequest,
  SandboxWaitRequest,
  ResolvedSandboxConfig,
  SandboxSpawnParams,
  SandboxSpawnResult,
} from "./types/sandbox/SandboxRuntime.js";
