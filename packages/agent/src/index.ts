/**
 * @downcity/agent — Agent 运行时公开 API。
 *
 * 关键点（中文）
 * - 这是 agent 包的唯一公开入口。
 * - city 包通过 `import { ... } from '@downcity/agent'` 使用代理运行时。
 */

// SDK 入口
export { Agent } from "./sdk/Agent.js";
export { RemoteAgent } from "./sdk/RemoteAgent.js";
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
} from "./types/sdk/AgentSdk.js";

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
export type { AgentContext } from './types/agent/AgentContext.js';

// 会话
export { Session } from './session/Session.js';

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
export { dashboardRouter } from "./http/dashboard/Router.js";
export { registerDashboardApiRoutes } from "./http/dashboard/DashboardApiRoutes.js";
export { registerDashboardAuthorizationRoutes } from "./http/dashboard/DashboardAuthorizationRoutes.js";
export { registerDashboardModelRoutes } from "./http/dashboard/ModelRoutes.js";
export { registerDashboardOverviewRoutes } from "./http/dashboard/OverviewRoutes.js";
export { registerDashboardSessionRoutes } from "./http/dashboard/SessionRoutes.js";
export { registerDashboardTaskRoutes } from "./http/dashboard/TaskRoutes.js";
export { executeBySessionId } from "./http/dashboard/ExecuteBySession.js";

// RPC
export { startLocalRpcServer } from './rpc/Server.js';
export { callAgentTransport } from './rpc/Transport.js';

// 服务框架
export {
  invokeServiceAction,
  resolveServiceAction,
} from "./service/ServiceActionRunner.js";
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
} from "./service/Manager.js";
export type {
  ServiceStateControlAction,
  ServiceStateControlResult,
  ServiceStateSnapshot,
} from "./service/Manager.js";
export {
  startServiceScheduleRuntime,
  stopServiceScheduleRuntime,
} from './service/schedule/Runtime.js';
export { runDueScheduledJobs } from "./service/schedule/Executor.js";
export { ServiceScheduleStore } from "./service/schedule/Store.js";
export { scheduledJobsTable } from "./service/schedule/Schema.js";
export {
  normalizeRunAtMsOrThrow,
  parseScheduledRunAtMsOrThrow,
  parseScheduleTimeOptionOrThrow,
} from "./service/schedule/Time.js";

// 模型
export { createModel } from './model/CreateModel.js';

// 配置
export { loadDowncityConfig, loadGlobalEnvFromStore, loadAgentEnvSnapshot } from './config/Config.js';
export { getDowncityJsonPath } from './config/Paths.js';

// Agent 项目初始化
export {
  normalizeDefaultAgentName,
  listConsoleModelChoices,
  isAgentProjectInitialized,
  initializeAgentProject,
} from "./agent/project/AgentInitializer.js";
export type { ConsoleModelChoice } from "./agent/project/AgentInitializer.js";
export {
  readProjectExecutionBinding,
  readProjectPrimaryModelId,
  hasProjectExecutionTarget,
  assertProjectExecutionTarget,
} from "./agent/project/ProjectExecutionBinding.js";

// Agent 项目准备
export {
  ensureRuntimeProjectReady,
  ensureRuntimeExecutionBindingReady,
} from "./daemon/ProjectSetup.js";

// 沙箱
