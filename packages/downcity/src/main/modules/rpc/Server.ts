/**
 * Local RPC server。
 *
 * 关键点（中文）
 * - 只服务本地受信任进程，不暴露 HTTP 协议。
 * - 这里承接本机 CLI 访问 agent runtime 的 IPC 路由，并与 HTTP 能力保持语义一致。
 */

import fs from "fs-extra";
import net, { type Server } from "node:net";
import path from "node:path";
import type { AgentRuntime } from "@/types/agent/AgentRuntime.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { JsonValue } from "@/shared/types/Json.js";
import type { LocalRpcRequest, LocalRpcResponse, LocalRpcServerHandle } from "@/shared/types/LocalRpc.js";
import type { DashboardSessionExecuteRequestBody } from "@/shared/types/DashboardSessionExecute.js";
import type {
  PluginActionResponse,
  PluginAvailabilityResponse,
  PluginListResponse,
} from "@/shared/types/PluginApi.js";
import type {
  ServiceControlAction,
  ServiceCommandResponse,
  ServiceControlResponse,
  ServiceListResponse,
} from "@/shared/types/Services.js";
import { listServiceStates, controlServiceState } from "@/main/service/ServiceStateController.js";
import { runServiceCommand } from "@/main/service/ServiceActionRunner.js";
import { executeBySessionId } from "@/main/modules/http/dashboard/ExecuteBySession.js";
import { getLocalRpcEndpoint } from "./Paths.js";

async function isSocketEndpointActive(endpoint: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection(endpoint);
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(200);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createSuccessResponse(
  requestId: string,
  data: JsonValue,
  status = 200,
): LocalRpcResponse {
  return {
    requestId,
    status,
    success: true,
    data,
  };
}

function createErrorResponse(
  requestId: string,
  status: number,
  error: string,
): LocalRpcResponse {
  return {
    requestId,
    status,
    success: false,
    error,
  };
}

async function handleServiceControl(params: {
  requestId: string;
  body: JsonValue | undefined;
  context: AgentContext;
}): Promise<LocalRpcResponse> {
  const body = isObjectRecord(params.body) ? params.body : {};
  const serviceName = String(body.serviceName || "").trim();
  const action = String(body.action || "").trim() as ServiceControlAction;
  if (!serviceName || !action) {
    return createErrorResponse(params.requestId, 400, "serviceName and action are required");
  }
  const result = await controlServiceState({
    serviceName,
    action,
    context: params.context,
  });
  const payload: ServiceControlResponse = {
    success: result.success,
    ...(result.service ? { service: result.service } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
  return createSuccessResponse(params.requestId, payload as unknown as JsonValue);
}

async function handleServiceCommand(params: {
  requestId: string;
  body: JsonValue | undefined;
  context: AgentContext;
}): Promise<LocalRpcResponse> {
  const body = isObjectRecord(params.body) ? params.body : {};
  const serviceName = String(body.serviceName || "").trim();
  const command = String(body.command || "").trim();
  if (!serviceName || !command) {
    return createErrorResponse(params.requestId, 400, "serviceName and command are required");
  }
  const result = await runServiceCommand({
    serviceName,
    command,
    payload: (body.payload ?? {}) as JsonValue,
    ...(body.schedule !== undefined ? { schedule: body.schedule as JsonValue } : {}),
    context: params.context,
  });
  const payload: ServiceCommandResponse = {
    success: result.success,
    ...(result.service ? { service: result.service } : {}),
    ...(result.data !== undefined ? { data: result.data } : {}),
    ...(result.message ? { message: result.message } : {}),
    ...(result.success ? {} : { error: result.message || "service command failed" }),
  };
  return createSuccessResponse(params.requestId, payload as unknown as JsonValue);
}

async function handlePluginAvailability(params: {
  requestId: string;
  body: JsonValue | undefined;
  context: AgentContext;
}): Promise<LocalRpcResponse> {
  const body = isObjectRecord(params.body) ? params.body : {};
  const pluginName = String(body.pluginName || "").trim();
  if (!pluginName) {
    return createErrorResponse(params.requestId, 400, "pluginName is required");
  }
  const availability = await params.context.plugins.availability(pluginName);
  const payload: PluginAvailabilityResponse = {
    success: true,
    pluginName,
    availability,
  };
  return createSuccessResponse(params.requestId, payload as unknown as JsonValue);
}

async function handlePluginAction(params: {
  requestId: string;
  body: JsonValue | undefined;
  context: AgentContext;
}): Promise<LocalRpcResponse> {
  const body = isObjectRecord(params.body) ? params.body : {};
  const pluginName = String(body.pluginName || "").trim();
  const actionName = String(body.actionName || "").trim();
  if (!pluginName) {
    return createErrorResponse(params.requestId, 400, "pluginName is required");
  }
  if (!actionName) {
    return createErrorResponse(params.requestId, 400, "actionName is required");
  }
  const result = await params.context.plugins.runAction({
    plugin: pluginName,
    action: actionName,
    payload: body.payload,
  });
  const payload: PluginActionResponse = {
    success: result.success,
    pluginName,
    actionName,
    ...(result.data !== undefined ? { data: result.data } : {}),
    ...(result.message ? { message: result.message } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
  return createSuccessResponse(
    params.requestId,
    payload as unknown as JsonValue,
    result.success ? 200 : 400,
  );
}

function matchDashboardSessionExecutePath(pathname: string): string | null {
  const match = /^\/api\/dashboard\/sessions\/([^/]+)\/execute$/.exec(
    String(pathname || "").trim(),
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[1] || "").trim() || null;
  } catch {
    return null;
  }
}

async function handleDashboardSessionExecute(params: {
  requestId: string;
  body: JsonValue | undefined;
  context: AgentContext;
  runtime?: AgentRuntime;
  sessionId: string;
}): Promise<LocalRpcResponse> {
  if (!params.runtime) {
    return createErrorResponse(
      params.requestId,
      500,
      "Local RPC dashboard execute requires agent runtime",
    );
  }
  const body = isObjectRecord(params.body) ? params.body : {};
  const instructions = String(body.instructions || "").trim();
  const attachments = Array.isArray(body.attachments)
    ? (body.attachments as DashboardSessionExecuteRequestBody["attachments"])
    : undefined;
  if (!params.sessionId) {
    return createErrorResponse(params.requestId, 400, "sessionId is required");
  }
  if (!instructions) {
    return createErrorResponse(params.requestId, 400, "instructions are required");
  }
  try {
    const result = await executeBySessionId({
      agentState: params.runtime,
      executionContext: params.context,
      sessionId: params.sessionId,
      instructions,
      attachments,
    });
    return createSuccessResponse(
      params.requestId,
      {
        success: true,
        sessionId: params.sessionId,
        result,
      } as unknown as JsonValue,
    );
  } catch (error) {
    return createErrorResponse(params.requestId, 500, String(error));
  }
}

async function dispatchRequest(params: {
  request: LocalRpcRequest;
  context: AgentContext;
  runtime?: AgentRuntime;
}): Promise<LocalRpcResponse> {
  const { request } = params;
  if (request.method === "GET" && request.path === "/api/services/list") {
    const payload: ServiceListResponse = {
      success: true,
      services: listServiceStates(),
    };
    return createSuccessResponse(request.requestId, payload as unknown as JsonValue);
  }
  if (request.method === "POST" && request.path === "/api/services/control") {
    return await handleServiceControl({
      requestId: request.requestId,
      body: request.body,
      context: params.context,
    });
  }
  if (request.method === "POST" && request.path === "/api/services/command") {
    return await handleServiceCommand({
      requestId: request.requestId,
      body: request.body,
      context: params.context,
    });
  }
  if (request.method === "GET" && request.path === "/api/plugins/list") {
    const payload: PluginListResponse = {
      success: true,
      plugins: params.context.plugins.list(),
    };
    return createSuccessResponse(request.requestId, payload as unknown as JsonValue);
  }
  if (request.method === "POST" && request.path === "/api/plugins/availability") {
    return await handlePluginAvailability({
      requestId: request.requestId,
      body: request.body,
      context: params.context,
    });
  }
  if (request.method === "POST" && request.path === "/api/plugins/action") {
    return await handlePluginAction({
      requestId: request.requestId,
      body: request.body,
      context: params.context,
    });
  }
  const dashboardSessionId =
    request.method === "POST"
      ? matchDashboardSessionExecutePath(request.path)
      : null;
  if (dashboardSessionId) {
    return await handleDashboardSessionExecute({
      requestId: request.requestId,
      body: request.body,
      context: params.context,
      runtime: params.runtime,
      sessionId: dashboardSessionId,
    });
  }
  return createErrorResponse(
    request.requestId,
    404,
    `Unknown local RPC path: ${request.method} ${request.path}`,
  );
}

async function ensureEndpointReady(endpoint: string): Promise<void> {
  if (process.platform === "win32") return;
  await fs.ensureDir(path.dirname(endpoint));
  const exists = await fs.pathExists(endpoint);
  if (!exists) return;
  if (await isSocketEndpointActive(endpoint)) {
    throw new Error(`Local RPC endpoint already in use: ${endpoint}`);
  }
  await fs.remove(endpoint);
}

function writeResponse(socket: net.Socket, response: LocalRpcResponse): void {
  socket.end(`${JSON.stringify(response)}\n`);
}

function bindConnectionHandler(params: {
  server: Server;
  context: AgentContext;
  runtime?: AgentRuntime;
}): void {
  const { server, context, runtime } = params;
  server.on("connection", (socket) => {
    let buffered = "";
    socket.setEncoding("utf8");
    socket.on("data", async (chunk) => {
      buffered += String(chunk || "");
      const newlineIndex = buffered.indexOf("\n");
      if (newlineIndex < 0) return;
      const raw = buffered.slice(0, newlineIndex).trim();
      if (!raw) {
        writeResponse(socket, createErrorResponse("unknown", 400, "Empty local RPC payload"));
        return;
      }
      try {
        const request = JSON.parse(raw) as LocalRpcRequest;
        const response = await dispatchRequest({
          request,
          context,
          runtime,
        });
        writeResponse(socket, response);
      } catch (error) {
        writeResponse(
          socket,
          createErrorResponse("unknown", 400, `Invalid local RPC request: ${String(error)}`),
        );
      }
    });
  });
}

/**
 * 启动本地 RPC server。
 */
export async function startLocalRpcServer(params: {
  context: AgentContext;
  runtime?: AgentRuntime;
}): Promise<LocalRpcServerHandle> {
  const endpoint = getLocalRpcEndpoint(params.context.rootPath);
  await ensureEndpointReady(endpoint);

  const server = net.createServer();
  bindConnectionHandler({
    server,
    context: params.context,
    runtime: params.runtime,
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, () => resolve());
  });

  return {
    endpoint,
    async stop() {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      if (process.platform !== "win32") {
        await fs.remove(endpoint);
      }
    },
  };
}
