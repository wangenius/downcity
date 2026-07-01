/**
 * Federation RPC client。
 *
 * 关键点（中文）
 * - 仅用于 `rpc://` 本机 Federation transport。
 * - 使用 NDJSON over TCP，与 `@downcity/server` 的 FederationRPC 对接。
 */

import type {
  FederationRpcRequest,
  FederationRpcResponseData,
  FederationRpcResponseFrame,
  FederationRpcTrustedAccess,
} from "@downcity/type";

/**
 * Node net 模块最小接口。
 */
interface NodeNetModule {
  /** 创建 TCP 连接。 */
  createConnection(options: { host: string; port: number }): RpcSocketLike;
}

/**
 * RPC socket 最小接口。
 */
interface RpcSocketLike {
  /** 写入数据。 */
  write(data: string): void;
  /** 主动销毁 socket。 */
  destroy(): void;
  /** 监听 connect 事件。 */
  on(event: "connect", listener: () => void): this;
  /** 监听 data 事件。 */
  on(event: "data", listener: (chunk: { toString(encoding: "utf8"): string }) => void): this;
  /** 监听 error 事件。 */
  on(event: "error", listener: (error: Error) => void): this;
  /** 监听 close 事件。 */
  on(event: "close", listener: () => void): this;
}

/**
 * Federation RPC 请求输入。
 */
export interface FederationRpcClientRequest {
  /** RPC URL，例如 `rpc://127.0.0.1:15315`。 */
  url: string;
  /** 本机可信访问级别，仅 Admin City 使用。 */
  trusted_access?: FederationRpcTrustedAccess;
  /** HTTP 方法。 */
  method: string;
  /** Federation 请求路径。 */
  path: string;
  /** 请求头。 */
  headers?: Record<string, string>;
  /** 请求 body。 */
  body?: string;
}

/**
 * 发送一次 Federation RPC 请求。
 */
export async function request_federation_rpc(
  input: FederationRpcClientRequest,
): Promise<FederationRpcResponseData> {
  const net = await load_node_net();
  const endpoint = parse_federation_rpc_url(input.url);
  const request_id = `fed_rpc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const request: FederationRpcRequest = {
    id: request_id,
    method: "federation.request",
    params: {
      method: input.method,
      path: input.path,
      headers: input.headers,
      body: input.body,
      trusted_access: input.trusted_access,
    },
  };

  return await new Promise<FederationRpcResponseData>((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let buffered = "";
    let settled = false;

    const finish = (error: unknown, data?: FederationRpcResponseData): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      resolve(data!);
    };

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      let newline_index = buffered.indexOf("\n");
      while (newline_index >= 0) {
        const line = buffered.slice(0, newline_index).trim();
        buffered = buffered.slice(newline_index + 1);
        if (line) {
          try {
            const frame = JSON.parse(line) as FederationRpcResponseFrame;
            if (frame.id !== request_id) {
              throw new Error(`Unexpected Federation RPC response id: ${frame.id}`);
            }
            if (!frame.success) {
              throw new Error(frame.error);
            }
            finish(undefined, frame.data);
          } catch (error) {
            finish(error);
          }
        }
        newline_index = buffered.indexOf("\n");
      }
    });

    socket.on("error", (error) => {
      finish(error);
    });

    socket.on("close", () => {
      if (!settled) {
        finish(new Error("Federation RPC socket closed before response"));
      }
    });
  });
}

async function load_node_net(): Promise<NodeNetModule> {
  const loader = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<NodeNetModule>;
  return await loader("node:net");
}

function parse_federation_rpc_url(value: string): { host: string; port: number } {
  const url = new URL(value);
  if (url.protocol !== "rpc:") {
    throw new TypeError(`Unsupported Federation RPC protocol: ${url.protocol}`);
  }
  if (!url.hostname) {
    throw new TypeError("Federation RPC url requires a host");
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new TypeError("Federation RPC url requires a valid port");
  }
  return {
    host: url.hostname,
    port,
  };
}
