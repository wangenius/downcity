/**
 * Agent remote：统一远程 SDK 客户端。
 *
 * 关键点（中文）
 * - 对外只暴露一个 `url` 入口，不向用户暴露 transport 细节。
 * - 当前内部支持 `http/https` 与 `rpc` 两种访问方式。
 * - `RemoteAgent` 只负责远程访问，不重复实现第二套会话编排器。
 */

import type {
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentSessionSummaryPage,
  RemoteAgentOptions,
  RemoteAgentSession,
} from "@/types/agent/AgentTypes.js";
import type { RemoteAgentTransport } from "@/agent/remote/RemoteTransport.js";
import { RemoteSession } from "@/agent/remote/RemoteSession.js";
import { create_remote_agent_transport } from "@/agent/remote/TransportFactory.js";

/**
 * RemoteAgent：远程 Agent 客户端。
 */
export class RemoteAgent {
  private readonly transport: RemoteAgentTransport;

  constructor(options: RemoteAgentOptions) {
    const url = String(options.url || "").trim();
    if (!url) {
      throw new Error("RemoteAgent requires a non-empty url");
    }
    this.transport = create_remote_agent_transport(url, options.token);
  }

  /**
   * 新建一个远程 session。
   */
  async createSession(
    input?: AgentCreateSessionInput,
  ): Promise<RemoteAgentSession> {
    const info = await this.transport.create_session(input);
    return new RemoteSession(this.transport, info.sessionId);
  }

  /**
   * 获取一个已存在的远程 session。
   */
  async getSession(sessionId: string): Promise<RemoteAgentSession> {
    const resolved_session_id = String(sessionId || "").trim();
    if (!resolved_session_id) {
      throw new Error("getSession requires a non-empty sessionId");
    }
    const info = await this.transport.get_info(resolved_session_id);
    return new RemoteSession(this.transport, info.sessionId);
  }

  /**
   * 列出远程 agent 的 session 摘要页。
   */
  async listSessions(
    input?: AgentListSessionsInput,
  ): Promise<AgentSessionSummaryPage> {
    return await this.transport.list_sessions(input);
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
