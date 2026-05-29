/**
 * run/start/restart 命令参数类型。
 *
 * 字段说明（中文）
 * - `port`/`host`：主 API 服务监听地址。
 *   - `agent start/restart` 中的 `port` 由 console 自动分配（CLI 不再暴露 `--port`）。
 * - `rpcPort`：Agent 本机 RPC 监听端口。
 *   - 属于内部启动参数，通常由 city 自动分配，不面向普通用户。
 * - `daemon`：兼容旧参数（显式声明后台/前台）。
 * - `foreground`：显式前台启动。
 */

export interface StartOptions {
  port?: number | string;
  host?: string;
  rpcPort?: number | string;
  daemon?: boolean | string;
  foreground?: boolean | string;
}
