/**
 * run/start/restart 命令参数类型。
 *
 * 字段说明（中文）
 * - `port`/`host`：主 API 服务监听地址。
 * - `webui`：是否启动交互式 Web UI。
 * - `webport`：交互式 Web UI 监听端口。
 */

export interface StartOptions {
  port?: number | string;
  host?: string;
  webui?: boolean | string;
  webport?: number | string;
}
