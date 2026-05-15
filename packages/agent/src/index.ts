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
export { initAgentRuntime, stopAgentHotReload, getAgentContext, getAgentRuntime } from './agent/AgentRuntime.js';
export type { AgentRuntime, AgentRuntimeBase } from './agent/AgentRuntimeState.js';

// Agent 上下文
export type { AgentContext } from './types/agent/AgentContext.js';

// 会话
export { Session } from './session/Session.js';

// HTTP 服务
export { startServer } from './http/Server.js';

// RPC
export { startLocalRpcServer } from './rpc/Server.js';
export { callAgentTransport } from './rpc/Transport.js';

// 服务框架
export { startAllServices, stopAllServices, runServiceCommand } from './service/Manager.js';
export { startServiceScheduleRuntime, stopServiceScheduleRuntime } from './service/schedule/Runtime.js';

// 模型
export { createModel } from './model/CreateModel.js';

// 配置
export { loadDowncityConfig, loadGlobalEnvFromStore, loadAgentEnvSnapshot } from './config/Config.js';
export { getDowncityJsonPath } from './config/Paths.js';

// 沙箱
