/**
 * 连接错误提示工具。
 *
 * 关键点（中文）：
 * - 把常见端口误用转成可操作文案。
 * - 15314 是 Agent RPC 端口，Chrome Extension 只能连接 Town runtime HTTP API。
 */

/**
 * 读取连接错误提示。
 */
export function readConnectionErrorHint(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/HTTP\/0\.9|15314|rpc/i.test(message)) {
    return "15314 是 Agent RPC 端口。Town URL 请使用 http://127.0.0.1:5314。";
  }
  if (/failed to fetch/i.test(message)) {
    return "无法连接到 Downcity Town。请确认 Town URL 可访问，本机默认使用 http://127.0.0.1:5314。";
  }
  return "";
}
