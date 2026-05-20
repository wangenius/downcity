/**
 * SDK 本地 RPC Server。
 *
 * 关键点（中文）
 * - 这里承接单个 Agent 实例的主 local RPC server 生命周期。
 * - 启动后暴露的是完整本机受信任 IPC 能力，而不是仅 SDK session 子集。
 */

import type { Agent } from "@/sdk/Agent.js";
import type { AgentRpcBinding } from "@/sdk/AgentSdkTypes.js";
import { startLocalRpcServer } from "@/server/rpc/Server.js";

/**
 * SDK RPC Server 管理器。
 */
export class SdkAgentRpcServer {
  private readonly agent: Agent;
  private binding: AgentRpcBinding | null = null;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  /**
   * 启动本地 RPC server。
   */
  async start(): Promise<AgentRpcBinding> {
    if (this.binding) {
      return this.binding;
    }
    const server = await startLocalRpcServer({
      core: this.agent.core,
    });
    this.binding = {
      endpoint: server.endpoint,
      server,
    };
    return this.binding;
  }

  /**
   * 停止本地 RPC server。
   */
  async stop(): Promise<void> {
    if (!this.binding) return;
    const current = this.binding;
    this.binding = null;
    await current.server.stop();
  }

  /**
   * 返回当前是否已启动。
   */
  isStarted(): boolean {
    return this.binding !== null;
  }
}
