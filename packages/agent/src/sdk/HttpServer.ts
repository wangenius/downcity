/**
 * SDK HTTP Server。
 *
 * 关键点（中文）
 * - 这里承接单个 Agent 实例的主 HTTP server 生命周期。
 * - 对外仍暴露 `RemoteAgent` 兼容的 SDK session API，同时保留完整 server 路由能力。
 */

import type { Agent } from "@/sdk/Agent.js";
import type { AgentHttpBinding, AgentHttpStartOptions } from "@/sdk/AgentSdkTypes.js";
import { startServer } from "@/server/http/Server.js";

/**
 * SDK HTTP Server 管理器。
 */
export class SdkAgentHttpServer {
  private readonly agent: Agent;
  private binding: AgentHttpBinding | null = null;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  /**
   * 启动 HTTP Server。
   */
  async start(options?: AgentHttpStartOptions): Promise<AgentHttpBinding> {
    if (this.binding) {
      return this.binding;
    }
    const host = String(options?.host || "127.0.0.1").trim() || "127.0.0.1";
    const port =
      typeof options?.port === "number" && Number.isInteger(options.port)
        ? options.port
        : 15314;
    const server = await startServer({
      host,
      port,
      core: this.agent.core,
    });
    this.binding = {
      baseUrl: `http://${host}:${port}`,
      host,
      port,
      server,
    };
    return this.binding;
  }

  /**
   * 停止 HTTP Server。
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
