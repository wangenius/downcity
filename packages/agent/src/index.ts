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
export { startServer } from "./host/http/Server.js";
export { executeRouter } from "./host/http/execute/execute.js";
export { healthRouter } from "./host/http/health/health.js";
export { pluginsRouter } from "./host/http/plugins/plugins.js";
export {
  ensureServiceActionRoutesRegistered,
  servicesRouter,
} from "./host/http/services/services.js";
export { staticRouter } from "./host/http/static/static.js";
export { controlRouter } from "./host/http/control/ControlRouter.js";
export { registerControlApiRoutes } from "./host/http/control/ControlApiRoutes.js";
export { registerControlAuthorizationRoutes } from "./host/http/control/ControlAuthorizationRoutes.js";
export { registerControlModelRoutes } from "./host/http/control/ModelRoutes.js";
export { registerControlOverviewRoutes } from "./host/http/control/OverviewRoutes.js";
export { registerControlSessionRoutes } from "./host/http/control/SessionRoutes.js";
export { registerControlTaskRoutes } from "./host/http/control/TaskRoutes.js";
export { executeBySessionId } from "./host/http/control/ExecuteBySession.js";

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
export { logger, getLogger, type Logger } from "./utils/logger/Logger.js";

// 共享协议类型与控制面常量
export * from "./host/types/AgentHost.js";
export * from "./agent/project/types/AgentProject.js";
export * from "./plugin/builtins/auth/types/AuthPlugin.js";
export * from "./host/runtime/types/Platform.js";
export * from "./host/runtime/types/PlatformGateway.js";
export * from "./host/daemon/types/Daemon.js";
export * from "./config/types/DowncityConfig.js";
export * from "./config/types/ExecutionBinding.js";
export * from "./host/http/execute/types/InlineInstant.js";
export * from "./utils/types/Json.js";
export * from "./config/types/LlmConfig.js";
export * from "./host/rpc/types/LocalRpc.js";
export * from "./plugin/types/Plugin.js";
export type {
  PluginCliBaseOptions,
  PluginActionResponse,
  PluginAvailabilityResponse,
  PluginAvailabilityView,
  PluginListResponse,
} from "./plugin/types/PluginApi.js";
export * from "./service/types/Service.js";
export * from "./service/types/ServiceSchedule.js";
export * from "./service/types/Services.js";
export * from "./config/types/Start.js";
export * from "./host/types/Store.js";
export * from "./plugin/types/PluginLifecycle.js";
export * from "./host/http/auth/types/AuthPermission.js";
export * from "./host/http/auth/types/AuthRoute.js";
export * from "./host/http/auth/types/AuthToken.js";
export * from "./host/http/auth/types/AuthTypes.js";

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
} from "./plugin/builtins/auth/runtime/AuthorizationConfig.js";
export { resolveAuthorizedUserRole } from "./plugin/builtins/auth/runtime/AuthorizationPolicy.js";
export { authPlugin } from "./plugin/builtins/auth/Plugin.js";
export { skillPlugin } from "./plugin/builtins/skill/Plugin.js";
export { webPlugin } from "./plugin/builtins/web/Plugin.js";
export { asrPlugin } from "./plugin/builtins/asr/Plugin.js";
export { ttsPlugin } from "./plugin/builtins/tts/Plugin.js";
export { workboardPlugin } from "./plugin/builtins/workboard/Plugin.js";

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
} from "./plugin/core/Catalog.js";
export { runLocalPluginAction, listLocalPlugins, getLocalPluginAvailability } from "./plugin/core/LocalExecution.js";
export { registerAllPluginsForCli } from "./plugin/core/PluginCommand.js";
export { listBuiltinPluginRuntimeAuthPolicies } from "./plugin/core/HttpRoutes.js";
export { persistProjectPluginConfig } from "./plugin/core/ProjectConfigStore.js";

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
} from "./sandbox/types/SandboxRuntime.js";
