/**
 * FederationRPC 监听绑定类型。
 *
 * 关键点（中文）
 * - FederationRPC 是本机可信 transport，默认只监听 loopback 地址。
 * - 监听结果只暴露可观测信息，不暴露底层 net.Server。
 */

/**
 * FederationRPC 监听绑定信息。
 */
export interface FederationRpcBinding {
  /** 完整 RPC 访问 URL，例如 `rpc://127.0.0.1:15315`。 */
  url: string;
  /** 当前监听主机。 */
  host: string;
  /** 当前监听端口。 */
  port: number;
}

/**
 * FederationRPC 监听参数。
 */
export interface FederationRpcListenOptions {
  /** 监听主机，默认 `127.0.0.1`；当前仅允许 loopback 地址。 */
  host?: string;
  /** 监听端口，默认 `15315`。 */
  port?: number;
}
