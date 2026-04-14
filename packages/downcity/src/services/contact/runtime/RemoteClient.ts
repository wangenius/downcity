/**
 * contact 远端 HTTP 客户端。
 *
 * 关键点（中文）
 * - contact 的 agent-to-agent 调用走独立轻量路由，不依赖用户 CLI auth。
 * - 已建联后的敏感调用必须携带 contact token。
 */

import type { JsonValue } from "@/shared/types/Json.js";

function normalizeEndpoint(endpoint: string): string {
  const raw = String(endpoint || "").trim();
  if (!raw) throw new Error("endpoint is required");
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function postJson<T>(params: {
  endpoint: string;
  path: string;
  body?: JsonValue;
  token?: string;
}): Promise<T> {
  const url = new URL(params.path, normalizeEndpoint(params.endpoint)).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.token) headers["X-Downcity-Contact-Token"] = params.token;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(params.body ?? {}),
  });
  const data = (await response.json().catch(() => null)) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  }
  return data;
}

/**
 * 调用远端 ping。
 */
export async function callContactPing<T>(params: {
  endpoint: string;
  token?: string;
}): Promise<T> {
  return await postJson<T>({
    endpoint: params.endpoint,
    path: "/api/contact/ping",
    token: params.token,
  });
}

/**
 * 调用远端 approve。
 */
export async function callContactApprove<T>(params: {
  endpoint: string;
  body: JsonValue;
}): Promise<T> {
  return await postJson<T>({
    endpoint: params.endpoint,
    path: "/api/contact/approve",
    body: params.body,
  });
}

/**
 * 调用远端 chat。
 */
export async function callContactChat<T>(params: {
  endpoint: string;
  token: string;
  body: JsonValue;
}): Promise<T> {
  return await postJson<T>({
    endpoint: params.endpoint,
    path: "/api/contact/chat",
    token: params.token,
    body: params.body,
  });
}

/**
 * 调用远端 share。
 */
export async function callContactShare<T>(params: {
  endpoint: string;
  token: string;
  body: JsonValue;
}): Promise<T> {
  return await postJson<T>({
    endpoint: params.endpoint,
    path: "/api/contact/share",
    token: params.token,
    body: params.body,
  });
}
