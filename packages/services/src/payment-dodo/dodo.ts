/**
 * Dodo Payments SDK 工具函数。
 *
 * 关键说明（中文）
 * - 创建 Checkout 使用官方 `dodopayments` SDK
 * - webhook 验签使用 SDK 自带 standardwebhooks unwrap
 * - 这里集中做字符串归一化和 SDK 响应裁剪
 */

import DodoPayments from "dodopayments";
import type { DodoPaymentEnvironment, DodoPaymentTopupRecord, DodoWebhookEvent } from "./types.js";

/**
 * Dodo Checkout API 创建参数。
 */
export interface DodoCreateCheckoutSessionInput {
  /**
   * 服务内部支付记录 ID。
   */
  payment_id: string;

  /**
   * 充值单信息。
   */
  topup: DodoPaymentTopupRecord;

  /**
   * Dodo product_id。
   */
  product_id: string;

  /**
   * 结算币种。
   */
  currency: string;

  /**
   * 支付完成跳转地址。
   */
  return_url: string;

  /**
   * 支付取消跳转地址。
   */
  cancel_url: string;
}

/**
 * Dodo Checkout API 创建结果。
 */
export interface DodoCheckoutSessionResult {
  /**
   * Dodo Checkout Session ID。
   */
  checkout_session_id: string;

  /**
   * Dodo Payment ID。
   */
  dodo_payment_id: string;

  /**
   * Dodo Checkout 托管页面 URL。
   */
  checkout_url: string;
}

/**
 * 创建 Dodo SDK client。
 */
export function createDodoClient(input: {
  /**
   * Dodo API key。
   */
  api_key: string;

  /**
   * webhook signing key。
   */
  webhook_key?: string;

  /**
   * SDK 运行环境。
   */
  environment: DodoPaymentEnvironment;

  /**
   * 可选 API 基础地址。
   */
  api_base_url?: string;
}): DodoPayments {
  const apiBaseURL = normalizeOptionalText(input.api_base_url);
  return new DodoPayments({
    bearerToken: normalizeRequired(input.api_key, "Dodo API key"),
    webhookKey: normalizeOptionalText(input.webhook_key) || null,
    ...(apiBaseURL ? { baseURL: apiBaseURL } : { environment: input.environment }),
  });
}

/**
 * 创建 Dodo Checkout Session。
 */
export async function createDodoCheckoutSession(
  client: DodoPayments,
  input: DodoCreateCheckoutSessionInput,
): Promise<DodoCheckoutSessionResult> {
  const response = await client.checkoutSessions.create({
    product_cart: [{
      product_id: input.product_id,
      quantity: 1,
      amount: readTopupAmountUsdCents(input.topup),
    }],
    billing_currency: input.currency.toUpperCase() as any,
    return_url: input.return_url,
    cancel_url: input.cancel_url,
    metadata: {
      payment_id: input.payment_id,
      topup_id: input.topup.topup_id,
      user_id: input.topup.user_id,
      amount: String(input.topup.amount),
      amount_usd_cents: String(readTopupAmountUsdCents(input.topup)),
    },
  });

  return {
    checkout_session_id: normalizeRequired(response.session_id, "Dodo checkout session id"),
    dodo_payment_id: normalizeOptionalText(response.payment_id),
    checkout_url: normalizeRequired(response.checkout_url, "Dodo checkout url"),
  };
}

/**
 * 读取支付 provider 需要的 USD cents 金额。
 */
function readTopupAmountUsdCents(topup: { amount?: unknown; amount_usd_cents?: unknown }): number {
  const direct = Number(topup.amount_usd_cents);
  if (Number.isSafeInteger(direct) && direct > 0) return direct;
  const fallback = Math.round(Number(topup.amount) / 10_000);
  if (!Number.isSafeInteger(fallback) || fallback <= 0) {
    throw new TypeError("topup amount_usd_cents must be a positive integer");
  }
  return fallback;
}

/**
 * 解析并可选校验 Dodo webhook。
 */
export function parseDodoWebhookEvent(input: {
  /**
   * Dodo SDK client。
   */
  client: DodoPayments;

  /**
   * 原始请求 body。
   */
  raw: string;

  /**
   * 请求头。
   */
  headers: Headers;

  /**
   * 是否执行验签。
   */
  verify: boolean;
}): DodoWebhookEvent {
  const event = input.verify
    ? input.client.webhooks.unwrap(input.raw, { headers: Object.fromEntries(input.headers.entries()) })
    : input.client.webhooks.unsafeUnwrap(input.raw);
  return event && typeof event === "object" ? event as unknown as DodoWebhookEvent : {};
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
 * 规范化 Dodo 运行环境。
 */
export function normalizeDodoEnvironment(value: unknown): DodoPaymentEnvironment {
  const normalized = normalizeOptionalText(value);
  if (normalized === "live_mode" || normalized === "test_mode") return normalized;
  if (normalized === "live") return "live_mode";
  if (normalized === "test") return "test_mode";
  return "test_mode";
}
