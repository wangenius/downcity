/**
 * run/start/restart 命令参数类型。
 *
 * 字段说明（中文）
 * - `port`/`host`：主 API 服务监听地址。
 * - `webui`：是否启动交互式 Web UI。
 * - `webport`：交互式 Web UI 监听端口。
 * - `daemon`：兼容旧参数（显式声明后台/前台）。
 * - `foreground`：显式前台启动。
 */

export interface StartOptions {
  port?: number | string;
  host?: string;
  webui?: boolean | string;
  webport?: number | string;
  daemon?: boolean | string;
  foreground?: boolean | string;
}
