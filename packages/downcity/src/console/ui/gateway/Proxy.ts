/**
 * Console UI 代理转发辅助。
 *
 * 关键点（中文）
 * - 负责把 `/api/*` 请求转发到选中 agent runtime。
 * - 保持最小职责，不参与 agent 选择逻辑。
 */

/**
 * 构造上游请求地址。
 */
export function buildConsoleUiUpstreamUrl(
  requestUrl: URL,
  baseUrl: string,
): string {
  const upstreamPath = new URL(requestUrl.pathname + requestUrl.search, baseUrl);
  upstreamPath.searchParams.delete("agent");
  return upstreamPath.toString();
}

/**
 * 转发请求到目标 runtime。
 */
export async function forwardConsoleUiRequest(
  request: Request,
  upstreamUrl: string,
): Promise<Response> {
  const method = request.method || "GET";
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === "host" ||
      lower === "content-length" ||
      lower === "x-city-agent"
    ) {
      continue;
    }
    headers.set(key, value);
  }

  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : Buffer.from(await request.arrayBuffer());

  const response = await fetch(upstreamUrl, {
    method,
    headers,
    body,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const outHeaders = new Headers();
  outHeaders.set(
    "content-type",
    response.headers.get("content-type") || "application/octet-stream",
  );
  return new Response(buffer, {
    status: response.status,
    headers: outHeaders,
  });
}
