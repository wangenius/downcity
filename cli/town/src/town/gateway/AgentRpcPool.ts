/**
 * Town 到 Agent 的 RPC 连接池。
 *
 * 关键点（中文）
 * - Town 统一维护到各 Agent daemon 的 RPC 长连接。
 * - 控制面 HTTP、SDK 发布、plugin/status 查询都应复用这里的连接。
 * - 该模块不暴露 HTTP 语义，只负责按 agent registry 解析并缓存 RpcClient。
 */

import { RpcClient } from "@downcity/agent/internal/rpc/Client.js";
import type { PlatformAgentOption } from "@downcity/agent";
import { resolveDaemonRpcEndpoint } from "../../process/daemon/Client.js";

/**
 * Agent RPC pool 依赖。
 */
export interface AgentRpcPoolHandlers {
  /**
   * 按用户可见 agent id 或项目根目录解析 agent。
   */
  resolveAgentById(requestedAgentId: string): Promise<PlatformAgentOption | null>;
}

/**
 * Town 内部 Agent RPC 连接池。
 */
export class AgentRpcPool {
  private readonly clients_by_url = new Map<string, RpcClient>();

  constructor(private readonly handlers: AgentRpcPoolHandlers) {}

  /**
   * 按 agent id 解析并返回可复用 RPC client。
   */
  async resolveClientByAgentId(requested_agent_id: string): Promise<RpcClient | null> {
    const agent = await this.handlers.resolveAgentById(requested_agent_id);
    return this.resolveClientForAgent(agent);
  }

  /**
   * 按已解析 agent 返回可复用 RPC client。
   */
  resolveClientForAgent(agent: PlatformAgentOption | null): RpcClient | null {
    if (!agent || agent.running !== true) return null;
    const endpoint = resolveDaemonRpcEndpoint({
      projectRoot: agent.projectRoot,
    });
    const rpc_url = `rpc://${endpoint.host}:${endpoint.port}`;
    const cached = this.clients_by_url.get(rpc_url);
    if (cached) return cached;
    const created = new RpcClient({
      host: endpoint.host,
      port: endpoint.port,
    });
    this.clients_by_url.set(rpc_url, created);
    return created;
  }

  /**
   * 关闭全部缓存连接。
   */
  async close(): Promise<void> {
    const clients = [...this.clients_by_url.values()];
    this.clients_by_url.clear();
    await Promise.all(clients.map((client) => client.close()));
  }
}
