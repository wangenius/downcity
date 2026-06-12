/**
 * RemoteAgent transport 协议。
 *
 * 关键点（中文）
 * - RemoteSession 只依赖这里定义的最小会话传输能力。
 * - HTTP / RPC transport 只负责协议适配，不持有 session 编排逻辑。
 */

import type {
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentSessionForkInput,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionInfo,
  AgentSessionSummaryPage,
  AgentSessionSystemSnapshot,
  RemoteAgentPluginActionInput,
  RemoteAgentPluginActionResult,
} from "@/types/agent/AgentTypes.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";

/**
 * Transport 持有的事件订阅句柄。
 */
export type TransportSubscription = {
  /** 关闭当前订阅。 */
  close(): Promise<void>;
};

/**
 * 单个远程 session 所需的 transport 能力。
 */
export type RemoteSessionTransport = {
  /** 读取 session 信息。 */
  get_info(session_id: string): Promise<AgentSessionInfo>;
  /** 发送 prompt。 */
  prompt(
    session_id: string,
    input: AgentSessionPromptInput,
  ): Promise<{ id: string }>;
  /** 订阅 session 事件。 */
  subscribe(params: {
    session_id: string;
    on_ready: () => void;
    on_event: (event: AgentSessionEvent) => void;
  }): Promise<TransportSubscription>;
  /** 读取 history。 */
  history(
    session_id: string,
    input?: AgentSessionHistoryInput,
  ): Promise<AgentSessionHistoryPage>;
  /** 读取 system snapshot。 */
  system(session_id: string): Promise<AgentSessionSystemSnapshot>;
  /** 分叉 session。 */
  fork(
    session_id: string,
    input?: AgentSessionForkInput | string,
  ): Promise<AgentSessionInfo>;
};

/**
 * RemoteAgent 顶层 transport 能力。
 */
export type RemoteAgentTransport = RemoteSessionTransport & {
  /** 新建 session。 */
  create_session(input?: AgentCreateSessionInput): Promise<AgentSessionInfo>;
  /** 列出 sessions。 */
  list_sessions(input?: AgentListSessionsInput): Promise<AgentSessionSummaryPage>;
  /** 执行远程 Agent runtime 内的 plugin action。 */
  run_plugin_action(
    input: RemoteAgentPluginActionInput,
  ): Promise<RemoteAgentPluginActionResult>;
  /** 关闭 transport 持有的长期连接。 */
  close?(): Promise<void>;
};
