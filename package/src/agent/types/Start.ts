/**
 * run/start/restart 命令参数类型。
 *
 * 字段说明（中文）
 * - `port`/`host`：主 API 服务监听地址。
 * - `daemon`：兼容旧参数（显式声明后台/前台）。
 * - `foreground`：显式前台启动。
 */

export interface StartOptions {
  port?: number | string;
  host?: string;
  daemon?: boolean | string;
  foreground?: boolean | string;
}
