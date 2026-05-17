/**
 * SDK 本地 RPC Server。
 *
 * 关键点（中文）
 * - 面向同机受信任进程提供最小 session JSON RPC 能力。
 * - v1 先支持 session 列表、加载、run、history、fork。
 * - stream 仍建议优先走 HTTP NDJSON。
 */

import fs from "fs-extra";
import net, { type Server } from "node:net";
import path from "node:path";
import type { Agent } from "@/host/sdk/Agent.js";
import type {
  LocalRpcRequest,
  LocalRpcResponse,
} from "@/shared/types/LocalRpc.js";
import { getSdkAgentRpcEndpointPath } from "@/host/sdk/Paths.js";

/**
 * SDK RPC Server 管理器。
 */
export class SdkAgentRpcServer {
  private readonly agent: Agent;
  private server: Server | null = null;
  private endpoint: string | null = null;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  /**
   * 启动本地 RPC server。
   */
  async start(): Promise<{ endpoint: string }> {
    if (this.server && this.endpoint) {
      return { endpoint: this.endpoint };
    }
    await this.agent.ensureServicesStarted();

    const endpoint = getSdkAgentRpcEndpointPath(this.agent.path, this.agent.id);
    await fs.ensureDir(path.dirname(endpoint));
    await fs.remove(endpoint).catch(() => undefined);

    const server = net.createServer((socket) => {
      let buffered = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        buffered += String(chunk || "");
        const newlineIndex = buffered.indexOf("\n");
        if (newlineIndex < 0) return;
        const raw = buffered.slice(0, newlineIndex).trim();
        buffered = buffered.slice(newlineIndex + 1);
        void this.respond(raw, socket);
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(endpoint, () => {
        server.off("error", reject);
        resolve();
      });
    });

    this.server = server;
    this.endpoint = endpoint;
    return { endpoint };
  }

  /**
   * 停止本地 RPC server。
   */
  async stop(): Promise<void> {
    if (!this.server) return;
    const current = this.server;
    const endpoint = this.endpoint;
    this.server = null;
    this.endpoint = null;
    await new Promise<void>((resolve) => current.close(() => resolve()));
    if (endpoint) {
      await fs.remove(endpoint).catch(() => undefined);
    }
  }

  private async respond(raw: string, socket: net.Socket): Promise<void> {
    let request: LocalRpcRequest | null = null;
    try {
      request = JSON.parse(raw) as LocalRpcRequest;
    } catch {
      socket.write(
        `${JSON.stringify({
          requestId: "unknown",
          status: 400,
          success: false,
          error: "Invalid RPC JSON payload",
        } satisfies LocalRpcResponse)}\n`,
      );
      return;
    }

    const response = await this.dispatch(request);
    socket.write(`${JSON.stringify(response)}\n`);
  }

  private async dispatch(request: LocalRpcRequest): Promise<LocalRpcResponse> {
    const requestId = String(request.requestId || "").trim() || "unknown";
    try {
      if (request.method === "GET" && request.path === "/api/sdk/sessions") {
        return {
          requestId,
          status: 200,
          success: true,
          data: {
            success: true,
            sessions: await this.agent.sessions(),
          } as unknown as LocalRpcResponse["data"],
        };
      }

      if (request.method === "POST" && request.path === "/api/sdk/sessions") {
        const body =
          request.body && typeof request.body === "object" && !Array.isArray(request.body)
            ? request.body
            : {};
        const session = await this.agent.session(
          typeof body.sessionId === "string" ? body.sessionId : undefined,
        );
        return {
          requestId,
          status: 200,
          success: true,
          data: {
            success: true,
            session: await session.toMetadata(),
          } as unknown as LocalRpcResponse["data"],
        };
      }

      const runMatch = /^\/api\/sdk\/sessions\/([^/]+)\/run$/.exec(request.path);
      if (request.method === "POST" && runMatch) {
        const session = await this.agent.session(
          decodeURIComponent(runMatch[1] || ""),
        );
        const body =
          request.body && typeof request.body === "object" && !Array.isArray(request.body)
            ? request.body
            : {};
        const query = String(body.query || "").trim();
        if (!query) {
          return {
            requestId,
            status: 400,
            success: false,
            error: "query is required",
          };
        }
        return {
          requestId,
          status: 200,
          success: true,
          data: {
            success: true,
            sessionId: session.id,
            result: await session.run({ query }),
          } as unknown as LocalRpcResponse["data"],
        };
      }

      const forkMatch = /^\/api\/sdk\/sessions\/([^/]+)\/fork$/.exec(request.path);
      if (request.method === "POST" && forkMatch) {
        const session = await this.agent.session(
          decodeURIComponent(forkMatch[1] || ""),
        );
        const body =
          request.body && typeof request.body === "object" && !Array.isArray(request.body)
            ? request.body
            : {};
        const forked = await session.fork(
          typeof body.messageId === "string" ? body.messageId : undefined,
        );
        return {
          requestId,
          status: 200,
          success: true,
          data: {
            success: true,
            session: await forked.toMetadata(),
          } as unknown as LocalRpcResponse["data"],
        };
      }

      const messagesMatch =
        /^\/api\/sdk\/sessions\/([^/]+)\/messages$/.exec(request.path);
      if (request.method === "GET" && messagesMatch) {
        const session = await this.agent.session(
          decodeURIComponent(messagesMatch[1] || ""),
        );
        return {
          requestId,
          status: 200,
          success: true,
          data: {
            success: true,
            sessionId: session.id,
            messages: await session.history(),
          } as unknown as LocalRpcResponse["data"],
        };
      }

      return {
        requestId,
        status: 404,
        success: false,
        error: `Unknown RPC path: ${request.method} ${request.path}`,
      };
    } catch (error) {
      return {
        requestId,
        status: 500,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
