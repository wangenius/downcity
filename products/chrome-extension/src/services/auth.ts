/**
 * 扩展鉴权工具。
 *
 * 关键点（中文）：
 * - 统一处理 Bearer Token 归一化、请求头注入与投递通道选择。
 * - 避免 popup / options / inline composer 各自维护一套鉴权细节。
 */

import { resolveConsoleBaseUrl } from "./consoleBase";

/**
 * 扩展鉴权参数。
 */
export interface ExtensionAuthOptions {
  /**
   * 当前配置的 Bearer Token 明文。
   */
  authToken?: string;
}

/**
 * Console 鉴权状态响应。
 */
export interface ConsoleExtensionAuthStatusResponse {
  /**
   * 请求是否成功。
   */
  success: boolean;
  /**
   * 是否已经完成本机 token 初始化。
   */
  initialized: boolean;
  /**
   * 当前是否需要提供 Bearer Token。
   */
  requireLogin: boolean;
}

/**
 * 归一化 Bearer Token。
 *
 * 关键点（中文）：
 * - 允许用户直接粘贴 token，或完整的 `Bearer xxx`。
 * - 存储层只保留纯 token，避免重复前缀。
 */
export function normalizeAuthToken(input: unknown): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const matched = raw.match(/^Bearer\s+(.+)$/i);
  return String(matched?.[1] || raw).trim();
}

/**
 * 生成 Authorization Header 值。
 */
export function toAuthorizationHeaderValue(input: unknown): string {
  const token = normalizeAuthToken(input);
  return token ? `Bearer ${token}` : "";
}

/**
 * 构造带鉴权的请求头。
 */
export function buildAuthHeaders(params?: {
  /**
   * 待注入的 token。
   */
  authToken?: unknown;
  /**
   * 原始请求头。
   */
  headers?: HeadersInit;
}): Headers {
  const headers = new Headers(params?.headers || {});
  const authorization = toAuthorizationHeaderValue(params?.authToken);
  if (authorization && !headers.has("authorization")) {
    headers.set("authorization", authorization);
  }
  return headers;
}

/**
 * 判断当前是否允许使用 sendBeacon。
 *
 * 关键点（中文）：
 * - `sendBeacon` 无法附加自定义 Authorization Header。
 * - 一旦开启统一鉴权，必须强制回退到 keepalive fetch。
 */
export function shouldUseBeaconTransport(authToken?: unknown): boolean {
  return !normalizeAuthToken(authToken);
}

/**
 * 判断是否属于统一鉴权错误。
 */
export function isAuthErrorMessage(input: unknown): boolean {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("missing bearer token") ||
    normalized.includes("invalid bearer token") ||
    normalized.includes("permission denied") ||
    normalized.includes("401")
  );
}

/**
 * 拉取 Console 当前鉴权状态。
 */
export async function fetchConsoleAuthStatus(params?: {
  /**
   * Console 基础地址。
   */
  consoleBaseUrl?: string;
}): Promise<ConsoleExtensionAuthStatusResponse> {
  const response = await fetch(
    `${resolveConsoleBaseUrl(params?.consoleBaseUrl)}/api/auth/status`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Partial<ConsoleExtensionAuthStatusResponse> &
    Record<string, unknown>;
  if (!response.ok || payload.success === false) {
    throw new Error(String(payload.error || payload.message || "读取鉴权状态失败"));
  }
  return {
    success: true,
    initialized: payload.initialized === true,
    requireLogin: payload.requireLogin === true,
  };
}

/**
 * 为鉴权错误补充可操作提示。
 */
export function decorateAuthErrorText(input: unknown): string {
  const message = String(input || "").trim();
  if (!message) return "未知错误";
  if (isAuthErrorMessage(message)) {
    return `${message}。请在扩展设置页填写 Bearer Token。`;
  }
  return message;
}
