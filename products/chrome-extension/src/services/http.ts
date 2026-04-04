/**
 * 扩展 HTTP 请求工具。
 *
 * 关键点（中文）：
 * - 统一处理 JSON 请求、错误提取与响应校验。
 * - 让 API 访问层更聚焦在路径与业务数据转换。
 */

import { buildAuthHeaders, type ExtensionAuthOptions } from "./auth";

/**
 * 发起 JSON 请求。
 */
export async function requestJson<T>(
  url: string,
  init?: RequestInit,
  authOptions?: ExtensionAuthOptions,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: buildAuthHeaders({
      authToken: authOptions?.authToken,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    }),
  });

  const rawText = await response.text();
  let json: unknown = null;
  if (rawText) {
    try {
      json = JSON.parse(rawText);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const errorHint =
      json && typeof json === "object"
        ? String(
            (json as Record<string, unknown>).error ||
              (json as Record<string, unknown>).message ||
              "",
          )
        : "";
    throw new Error(
      errorHint || `请求失败：HTTP ${response.status} ${response.statusText}`,
    );
  }

  if (!json || typeof json !== "object") {
    throw new Error("服务返回的不是合法 JSON");
  }

  return json as T;
}
