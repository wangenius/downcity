/**
 * Agent 本机 RPC Server。
 *
 * 职责说明（中文）
 * - 为本机 `RemoteAgent(rpc://...)` 提供最小 SDK 会话访问面。
 * - 当前只承载 Session actor 所需方法，不混入控制台 HTTP 语义。
 * - 协议使用逐行 JSON（NDJSON），便于调试与事件流推送。
 */

import net from "node:net";
import type {
  AgentListSessionsInput,
  AgentSessionCollection,
} from "@/types/agent/AgentTypes.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";

type RpcSessionRequest =
  | {
      id: string;
      method: "sdk.sessions.list";
      params?: AgentListSessionsInput;
    }
  | {
      id: string;
      method: "sdk.sessions.create";
      params?: {
        sessionId?: string;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.get";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.prompt";
      params: {
        sessionId: string;
        input: AgentSessionPromptInput;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.history";
      params: {
        sessionId: string;
        input?: {
          limit?: number;
          cursor?: string;
          order?: "asc" | "desc";
          view?: "message" | "timeline";
        };
      };
    }
  | {
      id: string;
      method: "sdk.sessions.system";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.fork";
      params: {
        sessionId: string;
        messageId?: string;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.subscribe";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.unsubscribe";
      params: {
        subscriptionId: string;
      };
    };

type RpcSuccessFrame = {
  id: string;
  success: true;
  data?: unknown;
};

type RpcErrorFrame = {
  id: string;
  success: false;
  error: string;
};

type RpcEventFrame = {
  type: "event";
  subscriptionId: string;
  event: AgentSessionEvent;
};

type SocketSubscription = {
  sessionId: string;
  unsubscribe: () => void;
};

/**
 * RPC Server 启动参数。
 */
export interface RpcServerStartOptions {
  /** RPC 服务监听端口。 */
  port: number;
  /** RPC 服务监听主机。 */
  host: string;
  /** Session 集合访问口。 */
  sessionCollection: AgentSessionCollection;
}

/**
 * RPC Server 运行实例。
 */
export interface RpcServerInstance {
  /** 当前监听 host。 */
  host: string;
  /** 当前监听 port。 */
  port: number;
  /** 当前访问 URL。 */
  url: string;
  /** 原生 net server。 */
  server: net.Server;
  /** 停止当前服务。 */
  stop(): Promise<void>;
}

/**
 * 启动 Agent 本机 RPC 服务。
 */
export async function startRpcServer(
  options: RpcServerStartOptions,
): Promise<RpcServerInstance> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    const subscriptions = new Map<string, SocketSubscription>();
    let buffered = "";

    const cleanupSubscriptions = (): void => {
      for (const subscription of subscriptions.values()) {
        subscription.unsubscribe();
      }
      subscriptions.clear();
    };

    const writeFrame = (frame: RpcSuccessFrame | RpcErrorFrame | RpcEventFrame): void => {
      socket.write(`${JSON.stringify(frame)}\n`);
    };

    const writeSuccess = (id: string, data?: unknown): void => {
      writeFrame({
        id,
        success: true,
        ...(data === undefined ? {} : { data }),
      });
    };

    const writeError = (id: string, error: unknown): void => {
      writeFrame({
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    };

    const handleRequest = async (request: RpcSessionRequest): Promise<void> => {
      try {
        switch (request.method) {
          case "sdk.sessions.list": {
            const page = await options.sessionCollection.listSessions(request.params);
            writeSuccess(request.id, { page });
            return;
          }
          case "sdk.sessions.create": {
            const session = await options.sessionCollection.createSession(request.params);
            writeSuccess(request.id, { session: await session.getInfo() });
            return;
          }
          case "sdk.sessions.get": {
            const session = await options.sessionCollection.getSession(request.params.sessionId);
            writeSuccess(request.id, { session: await session.getInfo() });
            return;
          }
          case "sdk.sessions.prompt": {
            const session = await options.sessionCollection.getSession(request.params.sessionId);
            const turn = await session.prompt(request.params.input);
            writeSuccess(request.id, { turn: { id: turn.id } });
            return;
          }
          case "sdk.sessions.history": {
            const session = await options.sessionCollection.getSession(request.params.sessionId);
            const history = await session.history(request.params.input);
            writeSuccess(request.id, { history });
            return;
          }
          case "sdk.sessions.system": {
            const session = await options.sessionCollection.getSession(request.params.sessionId);
            writeSuccess(request.id, { system: await session.system() });
            return;
          }
          case "sdk.sessions.fork": {
            const session = await options.sessionCollection.getSession(request.params.sessionId);
            const forked = await session.fork(request.params.messageId);
            writeSuccess(request.id, { session: await forked.getInfo() });
            return;
          }
          case "sdk.sessions.subscribe": {
            const session = await options.sessionCollection.getSession(request.params.sessionId);
            const subscriptionId = `${request.params.sessionId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
            const unsubscribe = session.subscribe((event) => {
              writeFrame({
                type: "event",
                subscriptionId,
                event,
              });
            });
            subscriptions.set(subscriptionId, {
              sessionId: request.params.sessionId,
              unsubscribe,
            });
            writeSuccess(request.id, { subscriptionId });
            return;
          }
          case "sdk.sessions.unsubscribe": {
            const subscription = subscriptions.get(request.params.subscriptionId);
            if (subscription) {
              subscription.unsubscribe();
              subscriptions.delete(request.params.subscriptionId);
            }
            writeSuccess(request.id, { unsubscribed: true });
            return;
          }
        }
      } catch (error) {
        writeError(request.id, error);
      }
    };

    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      let newlineIndex = buffered.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex).trim();
        buffered = buffered.slice(newlineIndex + 1);
        if (line) {
          try {
            const parsed = JSON.parse(line) as RpcSessionRequest;
            void handleRequest(parsed);
          } catch (error) {
            writeFrame({
              id: "parse",
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        newlineIndex = buffered.indexOf("\n");
      }
    });

    socket.on("error", () => {
      cleanupSubscriptions();
    });
    socket.on("close", () => {
      sockets.delete(socket);
      cleanupSubscriptions();
    });
    socket.on("end", () => {
      cleanupSubscriptions();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    host: options.host,
    port: options.port,
    url: `rpc://${options.host}:${options.port}`,
    server,
    async stop(): Promise<void> {
      // 关键点（中文）：RPC 是长连接；停止 server 时必须主动关闭现有 socket。
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
