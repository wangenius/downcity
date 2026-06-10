/**
 * Downcity 官方 Payment 服务。
 *
 * 关键说明（中文）
 * - 这是统一的支付入口服务
 * - 当前只负责暴露 methods，让前端知道有哪些支付方式可用
 * - 具体支付链路仍由 `payment.stripe` 之类的具体服务承接
 */

import type { ServiceDefinition } from "@downcity/city";
import type {
  PaymentMethodDefinition,
  PaymentMethodItem,
  PaymentServiceOptions,
  CreemPaymentMethodOptions,
  StripePaymentMethodOptions,
} from "./types.js";

/**
 * 创建统一 Payment 服务。
 */
export function paymentService(options: PaymentServiceOptions): ServiceDefinition {
  return {
    id: "payment",
    name: "Payment",
    version: "0.1.0",
    instruction: [
      "统一暴露当前 City 可用的支付方式列表。",
      "前端应该先读取 methods，再决定展示哪种支付入口。",
      "具体支付动作仍然由具体服务处理，例如 payment.stripe。",
    ].join("\n"),
    install(ctx) {
      ctx.route({
        method: "GET",
        path: "/methods",
        auth: [],
        async handler(requestCtx) {
          return requestCtx.jsonResponse({
            items: options.methods.map((method) => method.resolve(ctx)),
          });
        },
      });
    },
  };
}

/**
 * 生成 Stripe 支付方式定义。
 */
export function stripePaymentMethod(options: StripePaymentMethodOptions = {}): PaymentMethodDefinition {
  return {
    resolve(ctx): PaymentMethodItem {
      const enabled = Boolean(options.secret_key || ctx.env("STRIPE_SECRET_KEY"));
      return {
        id: "stripe",
        type: "checkout",
        enabled,
        label: options.label?.trim() || "Stripe",
        service: "payment.stripe",
        action: "checkout/create",
        requires_user: true,
        currency: normalizeCurrency(ctx.env("STRIPE_CURRENCY")) || normalizeCurrency(options.currency) || "usd",
        reason: enabled ? undefined : "not_configured",
      };
    },
  };
}

/**
 * 生成 Creem 支付方式定义。
 */
export function creemPaymentMethod(options: CreemPaymentMethodOptions = {}): PaymentMethodDefinition {
  return {
    resolve(ctx): PaymentMethodItem {
      const hasApiKey = Boolean(options.api_key || ctx.env("CREEM_API_KEY"));
      const hasProductId = Boolean(options.product_id || ctx.env("CREEM_PRODUCT_ID"));
      const enabled = hasApiKey && hasProductId;
      return {
        id: "creem",
        type: "checkout",
        enabled,
        label: options.label?.trim() || "Creem",
        service: "payment.creem",
        action: "checkout/create",
        requires_user: true,
        currency: normalizeCurrency(ctx.env("CREEM_CURRENCY")) || normalizeCurrency(options.currency) || "usd",
        reason: enabled ? undefined : "not_configured",
      };
    },
  };
}

/**
 * 统一规范化币种。
 */
function normalizeCurrency(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}
