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
  AgentArchiveSessionInput,
  AgentArchiveSessionsInput,
  AgentArchiveSessionResult,
  AgentArchiveSessionsResult,
  AgentCleanArchiveResult,
  AgentSessionForkInput,
  AgentSessionRecordsInput,
  AgentSessionRecordsPage,
  AgentSessionInfo,
  AgentSessionSummaryPage,
  AgentSessionSystemSnapshot,
} from "@/types/agent/SessionTypes.js";
import type {
  RemoteAgentPluginActionInput,
  RemoteAgentPluginActionResult,
} from "@/types/agent/RemoteAgentPluginAction.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionStopResult } from "@/types/sdk/AgentSessionStop.js";
import type {
  ShellApprovalMode,
  ShellApprovalDecisionResult,
  ShellApprovalModeUpdateResult,
  ShellApprovalModeOption,
  ShellSessionApprovalModeView,
  ShellApprovalView,
} from "@downcity/shell";

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
  /** 停止当前 session turn，并取消未吸收队列。 */
  stop(session_id: string): Promise<AgentSessionStopResult>;
  /** 订阅 session 事件。 */
  subscribe(params: {
    session_id: string;
    on_ready: () => void;
    on_event: (event: AgentSessionEvent) => void;
    /** 底层事件连接结束后的通知；主动关闭不触发。 */
    on_close: (error?: unknown) => void;
  }): Promise<TransportSubscription>;
  /** 读取 history。 */
  records(
    session_id: string,
    input?: AgentSessionRecordsInput,
  ): Promise<AgentSessionRecordsPage>;
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
  /** 归档 session。 */
  archive_session(input: AgentArchiveSessionInput): Promise<AgentArchiveSessionResult>;
  /** 列出已归档 sessions。 */
  archive_sessions(input?: AgentArchiveSessionsInput): Promise<AgentArchiveSessionsResult>;
  /** 清空归档 sessions。 */
  clean_archive(): Promise<AgentCleanArchiveResult>;
  /** 执行远程 Agent runtime 内的 plugin action。 */
  run_plugin_action(
    input: RemoteAgentPluginActionInput,
  ): Promise<RemoteAgentPluginActionResult>;
  /** 列出 shell approvals。 */
  approvals(): Promise<ShellApprovalView[]>;
  /** 列出 shell approval modes。 */
  approval_modes(): Promise<ShellApprovalModeOption[]>;
  /** 读取 shell approval mode。 */
  approval_mode(input: { session_id: string }): Promise<ShellSessionApprovalModeView>;
  /** 设置 shell approval mode。 */
  set_approval_mode(input: {
    session_id: string;
    mode: ShellApprovalMode;
  }): Promise<ShellApprovalModeUpdateResult>;
  /** 批准 shell approval。 */
  approve(input: { approval_id: string }): Promise<ShellApprovalDecisionResult>;
  /** 拒绝 shell approval。 */
  deny(input: { approval_id: string }): Promise<ShellApprovalDecisionResult>;
  /** 关闭 transport 持有的长期连接。 */
  close?(): Promise<void>;
};
