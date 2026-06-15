/**
 * Creem HTTP / webhook 工具函数。
 *
 * 关键说明（中文）
 * - 不依赖 Creem SDK，统一走官方 HTTP API
 * - 创建 Checkout 使用 JSON body，兼容 Node 与 Worker
 * - webhook 验签使用 Web Crypto API，便于 Cloudflare Workers 运行
 */

import type {
  CreemCheckoutSessionResult,
  CreemCreateCheckoutSessionInput,
  CreemWebhookEvent,
} from "./types.js";

/**
 * 规范化 Creem API 基础地址。
 */
export function normalizeCreemApiBaseURL(value: string | undefined): string {
  const normalized = String(value ?? "https://api.creem.io/v1").trim();
  if (!normalized) throw new TypeError("Creem API server URL is required");
  return normalized.replace(/\/+$/, "");
}

/**
 * 创建 Creem Checkout Session。
 */
export async function createCreemCheckoutSession(
  apiKey: string,
  apiBaseURL: string,
  input: CreemCreateCheckoutSessionInput,
): Promise<CreemCheckoutSessionResult> {
  const response = await fetch(`${normalizeCreemApiBaseURL(apiBaseURL)}/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": normalizeRequired(apiKey, "Creem API key"),
    },
    body: JSON.stringify({
      product_id: input.product_id,
      success_url: input.success_url,
      request_id: input.payment_id,
      metadata: {
        payment_id: input.payment_id,
        topup_id: input.topup.topup_id,
        user_id: input.topup.user_id,
        amount: input.topup.amount,
        amount_microcredits: input.topup.amount_microcredits,
        amount_usd_cents: readTopupAmountUsdCents(input.topup),
      },
    }),
  });

  const payload = await readJSONRecord(response);
  if (!response.ok) {
    const message = String(
      (payload.error && typeof payload.error === "object" ? payload.error.message : "") ||
      payload.message ||
      "Creem checkout session creation failed",
    ).trim();
    throw new Error(message || "Creem checkout session creation failed");
  }

  const checkoutId = normalizeRequired(payload.id ?? payload.checkout_id, "Creem checkout id");
  const checkoutURL = normalizeRequired(payload.checkout_url ?? payload.url, "Creem checkout url");
  return {
    checkout_id: checkoutId,
    checkout_url: checkoutURL,
  };
}

/**
 * 读取支付 provider 需要的 USD cents 金额。
 */
function readTopupAmountUsdCents(topup: { amount?: unknown; amount_usd_cents?: unknown }): number {
  const direct = Number(topup.amount_usd_cents);
  if (Number.isSafeInteger(direct) && direct > 0) return direct;
  const fallback = Math.round(Number(topup.amount) * 100);
  if (!Number.isSafeInteger(fallback) || fallback <= 0) {
    throw new TypeError("topup amount_usd_cents must be a positive integer");
  }
  return fallback;
}

/**
 * 解析 Creem webhook 事件。
 */
export function parseCreemWebhookEvent(raw: string): CreemWebhookEvent {
  const parsed = JSON.parse(raw || "{}");
  return parsed && typeof parsed === "object" ? parsed as CreemWebhookEvent : {};
}

/**
 * 验证 Creem webhook 签名。
 *
 * 关键说明（中文）
 * - Creem 当前 webhook header 使用 `creem-signature`
 * - 签名值是 raw body 基于 webhook secret 的 HMAC-SHA256 hex
 */
export async function verifyCreemSignature(raw: string, header: string | null, secret: string): Promise<boolean> {
  const signature = normalizeOptionalText(header);
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(raw));
  const expected = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(signature, expected);
}

/**
 * 规范化非空字符串。
 */
export function normalizeRequired(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

/**
 * 规范化可选字符串。
 */
export function normalizeOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 规范化 metadata 对象。
 */
export function readMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * 常量时间比较两个签名字符串。
 */
function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

/**
 * 读取 JSON 响应并兜底为空对象。
 */
async function readJSONRecord(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, any> : {};
  } catch {
    return { message: text };
  }
}
