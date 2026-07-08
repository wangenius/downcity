/**
 * Agent remote：统一远程 SDK 客户端。
 *
 * 关键点（中文）
 * - 对外只暴露一个 `url` 入口，不向用户暴露 transport 细节。
 * - 当前内部支持 `http/https` 与 `rpc` 两种访问方式。
 * - `RemoteAgent` 只负责远程访问，不重复实现第二套会话编排器。
 */

import type {
  AgentArchiveSessionInput,
  AgentArchiveSessionsInput,
  AgentArchiveSessionResult,
  AgentArchiveSessionsResult,
  AgentCleanArchiveResult,
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentSessionSummaryPage,
  AgentSessions,
  RemoteAgentPluginActionInput,
  RemoteAgentPluginActionResult,
  RemoteAgentOptions,
  RemoteAgentSession,
} from "@/types/agent/AgentTypes.js";
import type {
  ShellApprovalMode,
  ShellApprovalDecisionResult,
  ShellApprovalModeUpdateResult,
  ShellApprovalModeOption,
  ShellSessionApprovalModeView,
  ShellApprovalView,
} from "@downcity/shell";
import type { RemoteAgentTransport } from "@/agent/remote/RemoteTransport.js";
import { RemoteSession } from "@/agent/remote/RemoteSession.js";
import { create_remote_agent_transport } from "@/agent/remote/TransportFactory.js";

/**
 * RemoteAgent：远程 Agent 客户端。
 */
export class RemoteAgent {
  readonly sessions: AgentSessions<RemoteAgentSession>;

  private readonly transport: RemoteAgentTransport;

  constructor(options: RemoteAgentOptions) {
    const url = String(options.url || "").trim();
    if (!url) {
      throw new Error("RemoteAgent requires a non-empty url");
    }
    this.transport = create_remote_agent_transport(url, options.token);
    this.sessions = new RemoteAgentSessions(this.transport);
  }

  /**
   * 执行远程 Agent runtime 内的 plugin action。
   *
   * 关键点（中文）
   * - 这是 RemoteAgent 顶层能力，不绑定某个 session。
   * - Shell approval 请使用 `approvals()` / `approve()` / `deny()`。
   */
  async runPluginAction(
    input: RemoteAgentPluginActionInput,
  ): Promise<RemoteAgentPluginActionResult> {
    const plugin = String(input.plugin || "").trim();
    const action = String(input.action || "").trim();
    if (!plugin) {
      throw new Error("runPluginAction requires a non-empty plugin");
    }
    if (!action) {
      throw new Error("runPluginAction requires a non-empty action");
    }
    return await this.transport.run_plugin_action({
      plugin,
      action,
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    });
  }

  /**
   * 列出远程 Agent 的 shell pending approvals。
   */
  async approvals(): Promise<ShellApprovalView[]> {
    return await this.transport.approvals();
  }

  /**
   * 列出远程 Agent 显式设置过的 shell approval 模式。
   */
  async approval_modes(): Promise<ShellApprovalModeOption[]> {
    return await this.transport.approval_modes();
  }

  /**
   * 读取远程 Agent 指定 session 的 shell approval 模式。
   */
  async approval_mode(input: { session_id: string }): Promise<ShellSessionApprovalModeView> {
    return await this.transport.approval_mode(input);
  }

  /**
   * 设置远程 Agent 指定 session 的 shell approval 模式。
   */
  async set_approval_mode(input: {
    session_id: string;
    mode: ShellApprovalMode;
  }): Promise<ShellApprovalModeUpdateResult> {
    return await this.transport.set_approval_mode(input);
  }

  /**
   * 批准远程 Agent 的 shell approval。
   */
  async approve(input: { approval_id: string }): Promise<ShellApprovalDecisionResult> {
    return await this.transport.approve(input);
  }

  /**
   * 拒绝远程 Agent 的 shell approval。
   */
  async deny(input: { approval_id: string }): Promise<ShellApprovalDecisionResult> {
    return await this.transport.deny(input);
  }

  /**
   * 关闭远程 transport。
   *
   * 关键点（中文）
   * - `rpc://` 会关闭底层长连接。
   * - `http://` / `https://` 没有常驻连接，调用时是安全 no-op。
   */
  async close(): Promise<void> {
    await this.transport.close?.();
  }

}

/**
 * 远程 Agent session 集合入口。
 *
 * 关键点（中文）
 * - `RemoteAgentTransport` 只负责协议传输，不直接暴露为用户 SDK API。
 * - 这里把远程传输包装成和本地 `agent.sessions` 一致的方法命名。
 */
class RemoteAgentSessions implements AgentSessions<RemoteAgentSession> {
  private readonly transport: RemoteAgentTransport;

  constructor(transport: RemoteAgentTransport) {
    this.transport = transport;
  }

  /** 新建一个远程 session。 */
  async create(input?: AgentCreateSessionInput): Promise<RemoteAgentSession> {
    const info = await this.transport.create_session(input);
    return new RemoteSession(this.transport, info);
  }

  /** 获取一个远程 session。 */
  async get(session_id: string): Promise<RemoteAgentSession> {
    const info = await this.transport.get_info(session_id);
    return new RemoteSession(this.transport, info);
  }

  /** 列出远程 session 摘要页。 */
  async list(input?: AgentListSessionsInput): Promise<AgentSessionSummaryPage> {
    return await this.transport.list_sessions(input);
  }

  /** 归档一个远程 session。 */
  async archive(input: AgentArchiveSessionInput): Promise<AgentArchiveSessionResult> {
    return await this.transport.archive_session(input);
  }

  /** 列出远程已归档 session。 */
  async archived(input?: AgentArchiveSessionsInput): Promise<AgentArchiveSessionsResult> {
    return await this.transport.archive_sessions(input);
  }

  /** 永久清空远程已归档 session。 */
  async clean_archive(): Promise<AgentCleanArchiveResult> {
    return await this.transport.clean_archive();
  }
}
