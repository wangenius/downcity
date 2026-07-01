/**
 * FederationRPC：把本地 Federation 暴露为本机 RPC 服务的对外类。
 *
 * 关键点（中文）
 * - RPC 只负责本机进程间传输，业务协议仍复用 Federation HTTP 路由。
 * - 默认只监听 loopback 地址，避免把免 token 的可信通道暴露到公网。
 * - 可信身份通过 `Federation.handleRequest(..., { trusted_identity })` 进程内传入，不走 HTTP header。
 */

import net from "node:net";
import type {
  FederationRpcIdentity,
  FederationRpcRequest,
  FederationRpcResponseData,
  FederationRpcResponseFrame,
} from "@downcity/type";
import type {
  FederationRpcBinding,
  FederationRpcListenOptions,
} from "@/types/FederationRpcBinding.js";

const DEFAULT_RPC_HOST = "127.0.0.1";
const DEFAULT_RPC_PORT = 15315;
const LOCAL_RPC_ORIGIN = "http://downcity.local";

/**
 * FederationRPC 可以挂载的最小目标接口。
 */
export interface FederationRpcTarget {
  /**
   * 处理一次 Federation 请求。
   */
  handleRequest(request: Request, options?: {
    /** 进程内可信身份，由 FederationRPC 注入。 */
    trusted_identity?: TrustedFederationRpcIdentity;
  }): Promise<Response>;
}

/**
 * FederationRPC 注入到 Federation 的可信身份。
 */
export type TrustedFederationRpcIdentity =
  | {
      /** 管理端身份。 */
      level: "admin";
    }
  | {
      /** 用户身份。 */
      level: "user";
      /** 当前用户信息。 */
      user: { user_id: string; metadata?: Record<string, unknown> };
      /** 当前用户所属 City。 */
      city: { city_id: string; status: string };
    };

/**
 * RPC server 运行实例。
 */
interface FederationRpcServerInstance {
  /** 当前监听 host。 */
  host: string;
  /** 当前监听 port。 */
  port: number;
  /** 当前访问 URL。 */
  url: string;
  /** 停止当前服务。 */
  stop(): Promise<void>;
}

/**
 * 把一个 `Federation` 暴露为本机 RPC 服务。
 */
export class FederationRPC {
  private readonly federation: FederationRpcTarget;
  private rpc_instance: FederationRpcServerInstance | null = null;
  private current_binding: FederationRpcBinding | null = null;
  private start_promise: Promise<FederationRpcBinding> | null = null;

  constructor(federation: FederationRpcTarget) {
    this.federation = federation;
  }

  /**
   * 监听 RPC 端口。
   */
  async listen(options?: FederationRpcListenOptions): Promise<FederationRpcBinding> {
    if (this.start_promise) return await this.start_promise;
    if (this.current_binding) return this.current_binding;
    this.start_promise = (async () => {
      const host = normalize_loopback_host(options?.host);
      const port = normalize_port(options?.port);
      const instance = await start_federation_rpc_server({
        host,
        port,
        federation: this.federation,
      });
      this.rpc_instance = instance;
      this.current_binding = {
        url: instance.url,
        host: instance.host,
        port: instance.port,
      };
      return this.current_binding;
    })();
    try {
      return await this.start_promise;
    } finally {
      this.start_promise = null;
    }
  }

  /**
   * 关闭 RPC 服务。
   */
  async close(): Promise<void> {
    const instance = this.rpc_instance;
    this.rpc_instance = null;
    this.current_binding = null;
    if (!instance) return;
    await instance.stop();
  }

  /**
   * 当前监听绑定信息，未 listen 时返回 `null`。
   */
  binding(): FederationRpcBinding | null {
    return this.current_binding;
  }
}

async function start_federation_rpc_server(options: {
  host: string;
  port: number;
  federation: FederationRpcTarget;
}): Promise<FederationRpcServerInstance> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buffered = "";

    const write_frame = (frame: FederationRpcResponseFrame): void => {
      socket.write(`${JSON.stringify(frame)}\n`);
    };

    const handle_line = (line: string): void => {
      void handle_federation_rpc_line({
        line,
        federation: options.federation,
        write_frame,
      });
    };

    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      let newline_index = buffered.indexOf("\n");
      while (newline_index >= 0) {
        const line = buffered.slice(0, newline_index).trim();
        buffered = buffered.slice(newline_index + 1);
        if (line) handle_line(line);
        newline_index = buffered.indexOf("\n");
      }
    });

    socket.on("close", () => {
      sockets.delete(socket);
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
    async stop(): Promise<void> {
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

async function handle_federation_rpc_line(params: {
  line: string;
  federation: FederationRpcTarget;
  write_frame(frame: FederationRpcResponseFrame): void;
}): Promise<void> {
  let request_id = "parse";
  try {
    const request = JSON.parse(params.line) as FederationRpcRequest;
    request_id = typeof request.id === "string" ? request.id : request_id;
    if (request.method !== "federation.request") {
      throw new Error(`Unsupported Federation RPC method: ${String(request.method)}`);
    }
    const response = await execute_federation_rpc_request(params.federation, request);
    params.write_frame({
      id: request_id,
      success: true,
      data: response,
    });
  } catch (error) {
    params.write_frame({
      id: request_id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function execute_federation_rpc_request(
  federation: FederationRpcTarget,
  rpc_request: FederationRpcRequest,
): Promise<FederationRpcResponseData> {
  const identity = normalize_rpc_identity(rpc_request.params.identity);
  const request = new Request(build_request_url(rpc_request.params.path), {
    method: normalize_method(rpc_request.params.method),
    headers: rpc_request.params.headers ?? {},
    body: normalize_request_body(rpc_request.params.method, rpc_request.params.body),
  });
  const response = await federation.handleRequest(request, {
    trusted_identity: identity,
  });
  return {
    status: response.status,
    headers: headers_to_record(response.headers),
    body: await response.text(),
  };
}

function normalize_rpc_identity(identity: FederationRpcIdentity): TrustedFederationRpcIdentity {
  if (!identity || typeof identity !== "object") {
    throw new TypeError("Federation RPC identity is required");
  }
  if (identity.role === "admin") {
    return { level: "admin" };
  }
  if (identity.role !== "user") {
    throw new TypeError("Unsupported Federation RPC identity role");
  }
  const city_id = String(identity.city_id || "").trim();
  if (!city_id) {
    throw new TypeError("city_id is required for Federation RPC user identity");
  }
  const user_id = String(identity.user_id || "local-rpc-user").trim() || "local-rpc-user";
  return {
    level: "user",
    user: {
      user_id,
      metadata: identity.metadata ?? {},
    },
    city: {
      city_id,
      status: "active",
    },
  };
}

function normalize_loopback_host(value: unknown): string {
  const host = String(value || DEFAULT_RPC_HOST).trim() || DEFAULT_RPC_HOST;
  if (!is_loopback_host(host)) {
    throw new TypeError(`FederationRPC only supports loopback host: ${host}`);
  }
  return host;
}

function is_loopback_host(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function normalize_port(value: unknown): number {
  const port = typeof value === "number" && Number.isInteger(value)
    ? value
    : DEFAULT_RPC_PORT;
  if (port <= 0 || port > 65535) {
    throw new TypeError(`Invalid Federation RPC port: ${String(value)}`);
  }
  return port;
}

function build_request_url(path: string): string {
  const normalized_path = String(path || "").trim();
  if (!normalized_path.startsWith("/")) {
    throw new TypeError("Federation RPC path must start with /");
  }
  return `${LOCAL_RPC_ORIGIN}${normalized_path}`;
}

function normalize_method(value: string): string {
  const method = String(value || "GET").trim().toUpperCase();
  if (!method) return "GET";
  return method;
}

function normalize_request_body(method: string, body: string | undefined): string | undefined {
  if (body === undefined) return undefined;
  const normalized_method = normalize_method(method);
  if (normalized_method === "GET" || normalized_method === "HEAD") {
    return undefined;
  }
  return body;
}

function headers_to_record(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
