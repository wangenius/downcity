/**
 * Agent 本机 RPC Server。
 *
 * 职责说明（中文）
 * - 为本机 `RemoteAgent(rpc://...)` 提供最小 SDK 会话访问面。
 * - 当前只承载 Session actor 所需方法，不混入控制台 HTTP 语义。
 * - 协议使用逐行 JSON（NDJSON），便于调试与事件流推送。
 */

import net from "node:net";
import fs from "fs-extra";
import { dirname } from "node:path";
import type { SystemModelMessage } from "ai";
import type {
  AgentListSessionsInput,
  AgentSessionCollection,
} from "@/types/agent/AgentTypes.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { JsonValue } from "@/types/common/Json.js";
import type { JsonObject } from "@/types/common/Json.js";
import type { PluginStateControlAction } from "@/plugin/types/Plugin.js";
import type { ControlSessionExecuteAttachmentInput } from "@/runtime/control/types/ControlSessionExecute.js";
import {
  readAuthControlPayload,
  setAuthControlUserRole,
  writeAuthControlConfig,
} from "@/runtime/control/AuthControlService.js";
import {
  getDowncityChatHistoryPath,
  getDowncitySessionMessagesPath,
} from "@/config/Paths.js";
import { resolveSessionSystemMessages } from "@/executor/composer/system/default/SystemDomain.js";
import {
  controlPluginState,
  listPluginStates,
} from "@/plugin/core/PluginStateController.js";
import { parsePluginCommandRequestBody } from "@/plugin/core/PluginCommandRequest.js";
import { runPluginCommand } from "@/plugin/core/PluginActionRunner.js";
import { executeBySessionId } from "@/runtime/control/ExecuteBySession.js";

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
    }
  | {
      id: string;
      method: "internal.status.get";
    }
  | {
      id: string;
      method: "internal.sessions.execute";
      params: {
        sessionId: string;
        instructions: string;
        attachments?: ControlSessionExecuteAttachmentInput[];
      };
    }
  | {
      id: string;
      method: "internal.sessions.clear_messages";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "internal.sessions.clear_chat_history";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "internal.sessions.resolve_system_prompt";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "internal.plugins.catalog";
    }
  | {
      id: string;
      method: "internal.plugins.list";
    }
  | {
      id: string;
      method: "internal.plugins.control";
      params: {
        pluginName: string;
        action: PluginStateControlAction;
      };
    }
  | {
      id: string;
      method: "internal.plugins.command";
      params: {
        pluginName: string;
        command: string;
        payload?: JsonValue;
        schedule?: JsonValue;
      };
    }
  | {
      id: string;
      method: "internal.plugins.availability";
      params: {
        pluginName: string;
      };
    }
  | {
      id: string;
      method: "internal.plugins.action";
      params: {
        pluginName: string;
        actionName: string;
        payload?: JsonValue;
      };
    }
  | {
      id: string;
      method: "internal.authorization.get";
    }
  | {
      id: string;
      method: "internal.authorization.config";
      params: {
        config: JsonObject;
      };
    }
  | {
      id: string;
      method: "internal.authorization.action";
      params: {
        action: string;
        channel: string;
        userId?: string;
        roleId?: string;
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
  /** Agent 上下文访问口。 */
  getAgentContext?: () => AgentContext;
  /** Agent 运行态访问口。 */
  getAgentRuntime?: () => AgentRuntime;
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
          case "internal.status.get": {
            writeSuccess(request.id, { status: "ok" });
            return;
          }
          case "internal.sessions.execute": {
            const runtime = requireAgentRuntime(options);
            const context = requireAgentContext(options);
            const result = await executeBySessionId({
              agentState: runtime,
              executionContext: context,
              sessionId: request.params.sessionId,
              instructions: request.params.instructions,
              attachments: request.params.attachments,
            });
            writeSuccess(request.id, {
              sessionId: request.params.sessionId,
              result,
            });
            return;
          }
          case "internal.sessions.clear_messages": {
            const runtime = requireAgentRuntime(options);
            const sessionId = String(request.params.sessionId || "").trim();
            if (!sessionId) throw new Error("Missing sessionId");
            const messagesPath = getDowncitySessionMessagesPath(
              runtime.rootPath,
              runtime.paths.agentId,
              sessionId,
            );
            await fs.remove(dirname(messagesPath));
            runtime.getSession(sessionId).clearExecutor();
            writeSuccess(request.id, {
              sessionId,
              cleared: true,
            });
            return;
          }
          case "internal.sessions.clear_chat_history": {
            const runtime = requireAgentRuntime(options);
            const sessionId = String(request.params.sessionId || "").trim();
            if (!sessionId) throw new Error("Missing sessionId");
            await fs.remove(getDowncityChatHistoryPath(runtime.rootPath, sessionId));
            writeSuccess(request.id, {
              sessionId,
              cleared: true,
            });
            return;
          }
          case "internal.sessions.resolve_system_prompt": {
            const runtime = requireAgentRuntime(options);
            const context = requireAgentContext(options);
            const sessionId = String(request.params.sessionId || "").trim() || "consoleui-chat-main";
            const systemMessages = await resolveSessionSystemMessages({
              projectRoot: runtime.rootPath,
              sessionId,
              profile: "chat",
              staticSystemPrompts: runtime.systems,
              context,
            });
            writeSuccess(request.id, {
              sessionId,
              ...toSystemPromptPayload(systemMessages),
            });
            return;
          }
          case "internal.plugins.catalog": {
            const context = requireAgentContext(options);
            writeSuccess(request.id, {
              plugins: context.plugins.list(),
            });
            return;
          }
          case "internal.plugins.list": {
            const context = requireAgentContext(options);
            writeSuccess(request.id, {
              plugins: listPluginStates({ context }),
            });
            return;
          }
          case "internal.plugins.control": {
            const context = requireAgentContext(options);
            const result = await controlPluginState({
              pluginName: request.params.pluginName,
              action: request.params.action,
              context,
            });
            writeSuccess(request.id, result);
            return;
          }
          case "internal.plugins.command": {
            const context = requireAgentContext(options);
            const body = parsePluginCommandRequestBody(request.params);
            const result = await runPluginCommand({
              pluginName: body.pluginName,
              command: body.command,
              payload: body.payload,
              schedule: body.schedule,
              context,
            });
            writeSuccess(request.id, result);
            return;
          }
          case "internal.plugins.availability": {
            const context = requireAgentContext(options);
            const availability = await context.plugins.availability(
              request.params.pluginName,
            );
            writeSuccess(request.id, {
              pluginName: request.params.pluginName,
              availability,
            });
            return;
          }
          case "internal.plugins.action": {
            const context = requireAgentContext(options);
            const result = await context.plugins.runAction({
              plugin: request.params.pluginName,
              action: request.params.actionName,
              payload: request.params.payload,
            });
            writeSuccess(request.id, {
              ...result,
              pluginName: request.params.pluginName,
              actionName: request.params.actionName,
            });
            return;
          }
          case "internal.authorization.get": {
            const context = requireAgentContext(options);
            writeSuccess(request.id, await readAuthControlPayload(context));
            return;
          }
          case "internal.authorization.config": {
            const context = requireAgentContext(options);
            writeSuccess(
              request.id,
              await writeAuthControlConfig({
                context,
                config: request.params.config,
              }),
            );
            return;
          }
          case "internal.authorization.action": {
            const context = requireAgentContext(options);
            const action = String(request.params.action || "").trim();
            if (action !== "setUserRole") {
              throw new Error(`Unsupported authorization action: ${action}`);
            }
            writeSuccess(
              request.id,
              await setAuthControlUserRole({
                context,
                input: {
                  channel: request.params.channel,
                  userId: String(request.params.userId || "").trim(),
                  roleId: String(request.params.roleId || "").trim(),
                },
              }),
            );
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

function requireAgentContext(options: RpcServerStartOptions): AgentContext {
  const context = options.getAgentContext?.();
  if (!context) {
    throw new Error("Agent RPC server was started without AgentContext");
  }
  return context;
}

function requireAgentRuntime(options: RpcServerStartOptions): AgentRuntime {
  const runtime = options.getAgentRuntime?.();
  if (!runtime) {
    throw new Error("Agent RPC server was started without AgentRuntime");
  }
  return runtime;
}

function normalizeSystemText(input: string | null | undefined): string {
  return String(input || "").trim();
}

function toSystemMessageText(message: SystemModelMessage): string {
  const content = message.content as unknown;
  if (typeof content === "string") return normalizeSystemText(content);
  if (!Array.isArray(content)) return "";
  const parts = content as Array<{ text?: unknown }>;
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const text = normalizeSystemText(String(part.text || ""));
    if (!text) continue;
    texts.push(text);
  }
  return texts.join("\n").trim();
}

/**
 * 把 system messages 转成 Console/Town 可直接渲染的结构。
 */
function toSystemPromptPayload(messages: SystemModelMessage[]): {
  sections: Array<{
    key: string;
    title: string;
    items: Array<{ index: number; content: string }>;
  }>;
  totalMessages: number;
  totalChars: number;
} {
  const items = messages
    .map((message, index) => ({
      index: index + 1,
      content: toSystemMessageText(message),
    }))
    .filter((item) => item.content);
  const totalChars = items.reduce(
    (acc, item) => acc + String(item.content || "").length,
    0,
  );
  return {
    sections: [
      {
        key: "resolved",
        title: "Resolved System Messages",
        items,
      },
    ],
    totalMessages: items.length,
    totalChars,
  };
}
