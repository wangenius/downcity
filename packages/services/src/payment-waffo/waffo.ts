/**
 * Waffo Pancake SDK 工具函数。
 *
 * 关键说明（中文）
 * - 创建 Checkout 使用官方 `@waffo/pancake-ts` SDK
 * - webhook 验签使用 SDK 自带 RSA-SHA256 verify
 * - 这里集中处理 SDK client、事件解析和字符串归一化
 */

import { WaffoPancake } from "@waffo/pancake-ts";
import type { WaffoPaymentEnvironment, WaffoPaymentTopupRecord, WaffoWebhookEvent } from "./types.ts";

/**
 * Waffo Checkout API 创建参数。
 */
export interface WaffoCreateCheckoutSessionInput {
  /**
   * 服务内部支付记录 ID。
   */
  payment_id: string;

  /**
   * 充值单信息。
   */
  topup: WaffoPaymentTopupRecord;

  /**
   * Waffo product_id。
   */
  product_id: string;

  /**
   * 结算币种。
   */
  currency: string;

  /**
   * 支付成功跳转地址。
   */
  success_url: string;
}

/**
 * Waffo Checkout API 创建结果。
 */
export interface WaffoCheckoutSessionResult {
  /**
   * Waffo Checkout Session ID。
   */
  session_id: string;

  /**
   * Waffo Checkout 托管页面 URL。
   */
  checkout_url: string;
}

/**
 * 创建 Waffo SDK client。
 */
export function createWaffoClient(input: {
  /**
   * Waffo Merchant ID。
   */
  merchant_id: string;

  /**
   * Waffo private key。
   */
  private_key: string;

  /**
   * 可选 webhook public key。
   */
  webhook_public_key?: string;

  /**
   * 可选 API 基础地址。
   */
  api_base_url?: string;
}): WaffoPancake {
  return new WaffoPancake({
    merchantId: normalizeRequired(input.merchant_id, "Waffo merchant id"),
    privateKey: normalizeRequired(input.private_key, "Waffo private key"),
    webhookPublicKey: normalizeOptionalText(input.webhook_public_key) || undefined,
    baseUrl: normalizeOptionalText(input.api_base_url) || undefined,
  });
}

/**
 * 创建 Waffo Checkout Session。
 */
export async function createWaffoCheckoutSession(
  client: WaffoPancake,
  input: WaffoCreateCheckoutSessionInput,
): Promise<WaffoCheckoutSessionResult> {
  const response = await client.checkout.createSession({
    productId: input.product_id,
    currency: input.currency.toUpperCase(),
    successUrl: input.success_url,
    orderMerchantExternalId: input.payment_id,
    metadata: {
      payment_id: input.payment_id,
      topup_id: input.topup.topup_id,
      user_id: input.topup.user_id,
      amount: String(input.topup.amount),
      amount_usd_cents: String(readTopupAmountUsdCents(input.topup)),
    },
  });

  return {
    session_id: normalizeRequired(response.sessionId, "Waffo checkout session id"),
    checkout_url: normalizeRequired(response.checkoutUrl, "Waffo checkout url"),
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
 * 解析并校验 Waffo webhook。
 */
export function parseWaffoWebhookEvent(input: {
  /**
   * Waffo SDK client。
   */
  client: WaffoPancake;

  /**
   * 原始请求 body。
   */
  raw: string;

  /**
   * 签名请求头。
   */
  signature: string | null;

  /**
   * 事件环境。
   */
  environment: WaffoPaymentEnvironment;
}): WaffoWebhookEvent {
  const event = input.client.webhooks.verify(input.raw, input.signature, {
    environment: input.environment,
  });
  return event && typeof event === "object" ? event as unknown as WaffoWebhookEvent : {};
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
 * 规范化 Waffo 运行环境。
 */
export function normalizeWaffoEnvironment(value: unknown): WaffoPaymentEnvironment {
  const normalized = normalizeOptionalText(value).toLowerCase();
  if (normalized === "prod" || normalized === "production" || normalized === "live") return "prod";
  return "test";
}
