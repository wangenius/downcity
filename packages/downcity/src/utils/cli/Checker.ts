/**
 * CLI 端口参数解析。
 *
 * 关键点（中文）
 * - 统一校验范围 1~65535，避免各 service 重复实现。
 */
export function parsePortOption(value: string): number {
  const port = Number.parseInt(value, 10);
  if (
    !Number.isFinite(port) ||
    Number.isNaN(port) ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535
  ) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}
