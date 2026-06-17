/**
 * Payment provider 工厂函数。
 *
 * 关键点（中文）
 * - Stripe / Creem / Dodo / Waffo 只是 provider，不是 service。
 * - 每个 provider 实现统一的 PaymentProvider 接口即可被 PaymentService 挂载。
 */

import {
  createCreemCheckoutSession,
  normalizeCreemApiBaseURL,
  parseCreemWebhookEvent,
  readMetadata as readCreemMetadata,
  verifyCreemSignature,
} from "../payment-creem/creem.js";
import {
  createDodoCheckoutSession,
  createDodoClient,
  normalizeDodoEnvironment,
  parseDodoWebhookEvent,
  readMetadata as readDodoMetadata,
} from "../payment-dodo/dodo.js";
import {
  createStripeCheckoutSession,
  normalizeStripeApiBaseURL,
  parseStripeWebhookEvent,
  readMetadata as readStripeMetadata,
  verifyStripeSignature,
} from "../payment-stripe/stripe.js";
import {
  createWaffoCheckoutSession,
  createWaffoClient,
  normalizeWaffoEnvironment,
  parseWaffoWebhookEvent,
  readMetadata as readWaffoMetadata,
} from "../payment-waffo/waffo.js";
import {
  normalizeCurrency,
  normalizeOptionalText,
  normalizeRequired,
  paymentMethodItem,
  randomId,
  readObjectId,
} from "./helpers.js";
import type {
  CreemPaymentProviderOptions,
  DodoPaymentProviderOptions,
  PaymentProvider,
  StripePaymentProviderOptions,
  WaffoPaymentProviderOptions,
} from "./types.js";

/**
 * 创建 Stripe payment provider。
 */
export function stripePaymentProvider(options: StripePaymentProviderOptions = {}): PaymentProvider {
  return {
    id: "stripe",
    label: options.label?.trim() || "Stripe",
    env: [
      { key: "STRIPE_SECRET_KEY", description: "Stripe secret key，用于创建 Checkout Session", required: true },
      { key: "STRIPE_WEBHOOK_SECRET", description: "Stripe webhook signing secret，用于校验 stripe-signature", required: false },
      { key: "STRIPE_CURRENCY", description: "默认结算币种，例如 usd", required: false },
      { key: "STRIPE_ITEM_NAME", description: "Stripe Checkout 展示的默认商品名", required: false },
      { key: "STRIPE_API_BASE_URL", description: "可选的 Stripe API 基础地址覆写，通常只用于测试环境", required: false },
    ],
    method(ctx) {
      const enabled = Boolean(options.secret_key || ctx.env("STRIPE_SECRET_KEY"));
      return paymentMethodItem({
        id: "stripe",
        enabled,
        label: options.label?.trim() || "Stripe",
        currency: normalizeCurrency(ctx.env("STRIPE_CURRENCY")) || normalizeCurrency(options.currency) || "usd",
      });
    },
    async createCheckout(input) {
      const secretKey = options.secret_key ?? input.ctx.env("STRIPE_SECRET_KEY");
      if (!secretKey) throw new Error("Stripe secret key is not configured");
      const created = await createStripeCheckoutSession(
        secretKey,
        normalizeStripeApiBaseURL(input.ctx.env("STRIPE_API_BASE_URL") || options.api_base_url),
        {
          payment_id: input.payment_id,
          topup: input.topup,
          currency: normalizeCurrency(input.ctx.env("STRIPE_CURRENCY")) || normalizeCurrency(options.currency) || "usd",
          success_url: input.success_url,
          cancel_url: input.cancel_url,
          item_name: normalizeOptionalText(input.ctx.env("STRIPE_ITEM_NAME")) || normalizeOptionalText(options.item_name) || "Downcity Topup",
        },
      );
      return {
        provider_session_id: created.session_id,
        provider_payment_id: created.payment_intent_id,
        checkout_url: created.checkout_url,
      };
    },
    async parseWebhook(input) {
      const webhookSecret = options.webhook_secret ?? input.ctx.env("STRIPE_WEBHOOK_SECRET");
      if (webhookSecret) {
        const valid = await verifyStripeSignature(input.raw, input.request.headers.get("stripe-signature"), webhookSecret);
        if (!valid) throw new Error("Invalid Stripe signature");
      }
      const event = parseStripeWebhookEvent(input.raw);
      const object = readStripeMetadata(event.data?.object);
      const metadata = readStripeMetadata(object.metadata);
      const type = normalizeOptionalText(event.type) || "unknown";
      const status = type === "checkout.session.completed"
        ? "paid"
        : type === "checkout.session.expired"
          ? "expired"
          : type === "payment_intent.payment_failed"
            ? "failed"
            : "ignored";
      const isPaymentIntent = type === "payment_intent.payment_failed";
      return {
        event_id: normalizeRequired(event.id, "stripe event id"),
        type,
        payload: event,
        status,
        payment_id: normalizeOptionalText(metadata.payment_id),
        topup_id: normalizeOptionalText(metadata.topup_id) || normalizeOptionalText(object.client_reference_id),
        provider_session_id: isPaymentIntent ? undefined : normalizeOptionalText(object.id),
        provider_payment_id: isPaymentIntent
          ? normalizeOptionalText(object.id)
          : normalizeOptionalText(object.payment_intent),
        ref: normalizeOptionalText(object.id),
        meta: {
          provider: "stripe",
          stripe_event_id: normalizeOptionalText(event.id),
          stripe_checkout_session_id: isPaymentIntent ? undefined : normalizeOptionalText(object.id),
          stripe_payment_intent_id: isPaymentIntent ? normalizeOptionalText(object.id) : normalizeOptionalText(object.payment_intent),
        },
      };
    },
  };
}

/**
 * 创建 Creem payment provider。
 */
export function creemPaymentProvider(options: CreemPaymentProviderOptions = {}): PaymentProvider {
  return {
    id: "creem",
    label: options.label?.trim() || "Creem",
    env: [
      { key: "CREEM_API_KEY", description: "Creem API key，用于创建 Checkout Session", required: true },
      { key: "CREEM_PRODUCT_ID", description: "Creem product_id，用于创建 Checkout Session", required: true },
      { key: "CREEM_WEBHOOK_SECRET", description: "Creem webhook signing secret，用于校验 creem-signature", required: false },
      { key: "CREEM_CURRENCY", description: "默认结算币种，例如 usd；仅用于支付目录展示和本地记录", required: false },
      { key: "CREEM_API_BASE_URL", description: "可选的 Creem API 基础地址覆写，通常只用于测试环境", required: false },
    ],
    method(ctx) {
      const enabled = Boolean((options.api_key || ctx.env("CREEM_API_KEY")) && (options.product_id || ctx.env("CREEM_PRODUCT_ID")));
      return paymentMethodItem({
        id: "creem",
        enabled,
        label: options.label?.trim() || "Creem",
        currency: normalizeCurrency(ctx.env("CREEM_CURRENCY")) || normalizeCurrency(options.currency) || "usd",
      });
    },
    async createCheckout(input) {
      const apiKey = options.api_key ?? input.ctx.env("CREEM_API_KEY");
      const productId = options.product_id ?? input.ctx.env("CREEM_PRODUCT_ID");
      if (!apiKey) throw new Error("Creem API key is not configured");
      if (!productId) throw new Error("Creem product id is not configured");
      const created = await createCreemCheckoutSession(
        apiKey,
        normalizeCreemApiBaseURL(input.ctx.env("CREEM_API_BASE_URL") || options.api_base_url),
        {
          payment_id: input.payment_id,
          topup: input.topup,
          product_id: productId,
          success_url: input.success_url,
        },
      );
      return {
        provider_session_id: created.checkout_id,
        checkout_url: created.checkout_url,
        metadata: { product_id: productId },
      };
    },
    async parseWebhook(input) {
      const webhookSecret = options.webhook_secret ?? input.ctx.env("CREEM_WEBHOOK_SECRET");
      if (webhookSecret) {
        const valid = await verifyCreemSignature(input.raw, input.request.headers.get("creem-signature"), webhookSecret);
        if (!valid) throw new Error("Invalid Creem signature");
      }
      const event = parseCreemWebhookEvent(input.raw);
      const object = readCreemEventObject(event);
      const metadata = readCreemMetadata(object.metadata);
      const type = normalizeOptionalText(event.eventType) || normalizeOptionalText(event.type) || "unknown";
      const order = readCreemMetadata(object.order);
      const orderId = readObjectId(order) || normalizeOptionalText(object.order_id);
      const checkoutId = readObjectId(object) || normalizeOptionalText(object.checkout_id);
      return {
        event_id: normalizeRequired(event.id, "creem event id"),
        type,
        payload: event,
        status: type === "checkout.completed"
          ? "paid"
          : type === "checkout.expired"
            ? "expired"
            : type === "checkout.failed" || type === "payment.failed"
              ? "failed"
              : "ignored",
        payment_id: normalizeOptionalText(metadata.payment_id) || normalizeOptionalText(object.request_id),
        topup_id: normalizeOptionalText(metadata.topup_id),
        provider_session_id: checkoutId,
        provider_order_id: orderId,
        ref: orderId || checkoutId,
        meta: {
          provider: "creem",
          creem_event_id: normalizeOptionalText(event.id),
          creem_checkout_id: checkoutId,
          creem_order_id: orderId,
        },
      };
    },
  };
}

/**
 * 创建 Dodo Payments provider。
 */
export function dodoPaymentProvider(options: DodoPaymentProviderOptions = {}): PaymentProvider {
  return {
    id: "dodo",
    label: options.label?.trim() || "Dodo Payments",
    env: [
      { key: "DODO_PAYMENTS_API_KEY", description: "Dodo Payments API key，用于创建 Checkout Session", required: true },
      { key: "DODO_PRODUCT_ID", description: "Dodo product_id，用于创建 Checkout Session", required: true },
      { key: "DODO_WEBHOOK_KEY", description: "Dodo webhook signing key，用于校验 webhook", required: false },
      { key: "DODO_ENVIRONMENT", description: "Dodo SDK 环境：test_mode 或 live_mode；默认 test_mode", required: false },
      { key: "DODO_CURRENCY", description: "默认结算币种，例如 usd", required: false },
      { key: "DODO_API_BASE_URL", description: "可选的 Dodo API 基础地址覆写，通常只用于测试环境", required: false },
    ],
    method(ctx) {
      const enabled = Boolean((options.api_key || ctx.env("DODO_PAYMENTS_API_KEY")) && (options.product_id || ctx.env("DODO_PRODUCT_ID")));
      return paymentMethodItem({
        id: "dodo",
        enabled,
        label: options.label?.trim() || "Dodo Payments",
        currency: normalizeCurrency(ctx.env("DODO_CURRENCY")) || normalizeCurrency(options.currency) || "usd",
      });
    },
    async createCheckout(input) {
      const apiKey = options.api_key ?? input.ctx.env("DODO_PAYMENTS_API_KEY");
      const productId = options.product_id ?? input.ctx.env("DODO_PRODUCT_ID");
      if (!apiKey) throw new Error("Dodo API key is not configured");
      if (!productId) throw new Error("Dodo product id is not configured");
      const client = createDodoClient({
        api_key: apiKey,
        webhook_key: options.webhook_key ?? input.ctx.env("DODO_WEBHOOK_KEY"),
        environment: normalizeDodoEnvironment(input.ctx.env("DODO_ENVIRONMENT") || options.environment),
        api_base_url: options.api_base_url ?? input.ctx.env("DODO_API_BASE_URL"),
      });
      const created = await createDodoCheckoutSession(client, {
        payment_id: input.payment_id,
        topup: input.topup,
        product_id: productId,
        currency: normalizeCurrency(input.ctx.env("DODO_CURRENCY")) || normalizeCurrency(options.currency) || "usd",
        return_url: input.success_url,
        cancel_url: input.cancel_url,
      });
      return {
        provider_session_id: created.checkout_session_id,
        provider_payment_id: created.dodo_payment_id,
        checkout_url: created.checkout_url,
        metadata: { product_id: productId },
      };
    },
    async parseWebhook(input) {
      const webhookKey = options.webhook_key ?? input.ctx.env("DODO_WEBHOOK_KEY");
      const client = createDodoClient({
        api_key: options.api_key ?? input.ctx.env("DODO_PAYMENTS_API_KEY") ?? "webhook_only",
        webhook_key: webhookKey,
        environment: normalizeDodoEnvironment(input.ctx.env("DODO_ENVIRONMENT") || options.environment),
        api_base_url: options.api_base_url ?? input.ctx.env("DODO_API_BASE_URL"),
      });
      const event = parseDodoWebhookEvent({
        client,
        raw: input.raw,
        headers: input.request.headers,
        verify: Boolean(webhookKey),
      });
      const object = readDodoMetadata(event.data || event.object);
      const metadata = readDodoMetadata(object.metadata);
      const type = normalizeOptionalText(event.type) || normalizeOptionalText(event.eventType) || "unknown";
      const providerPaymentId = normalizeOptionalText(object.payment_id) || normalizeOptionalText(object.id);
      const checkoutSessionId = normalizeOptionalText(object.checkout_session_id);
      return {
        event_id: normalizeRequired(event.id || event.event_id || providerPaymentId || `evt_${randomId()}`, "dodo event id"),
        type,
        payload: event,
        status: type === "payment.succeeded"
          ? "paid"
          : type === "payment.failed"
            ? "failed"
            : type === "payment.cancelled" || type === "payment.canceled"
              ? "canceled"
              : "ignored",
        payment_id: normalizeOptionalText(metadata.payment_id),
        topup_id: normalizeOptionalText(metadata.topup_id),
        provider_session_id: checkoutSessionId,
        provider_payment_id: providerPaymentId,
        ref: providerPaymentId || checkoutSessionId,
        meta: {
          provider: "dodo",
          dodo_event_id: normalizeOptionalText(event.id || event.event_id),
          dodo_checkout_session_id: checkoutSessionId,
          dodo_payment_id: providerPaymentId,
        },
      };
    },
  };
}

/**
 * 创建 Waffo Pancake provider。
 */
export function waffoPaymentProvider(options: WaffoPaymentProviderOptions = {}): PaymentProvider {
  return {
    id: "waffo",
    label: options.label?.trim() || "Waffo Pancake",
    env: [
      { key: "WAFFO_MERCHANT_ID", description: "Waffo Merchant ID，例如 MER_xxx", required: true },
      { key: "WAFFO_PRIVATE_KEY", description: "Waffo API private key，用于 SDK 请求签名", required: true },
      { key: "WAFFO_PRODUCT_ID", description: "Waffo product_id，用于创建 Checkout Session", required: true },
      { key: "WAFFO_WEBHOOK_PUBLIC_KEY", description: "Waffo webhook public key，用于校验 x-waffo-signature", required: false },
      { key: "WAFFO_ENVIRONMENT", description: "Waffo 环境：test 或 prod；默认 test", required: false },
      { key: "WAFFO_CURRENCY", description: "默认结算币种，例如 usd", required: false },
      { key: "WAFFO_API_BASE_URL", description: "可选的 Waffo API 基础地址覆写，通常只用于测试环境", required: false },
    ],
    method(ctx) {
      const enabled = Boolean(
        (options.merchant_id || ctx.env("WAFFO_MERCHANT_ID")) &&
        (options.private_key || ctx.env("WAFFO_PRIVATE_KEY")) &&
        (options.product_id || ctx.env("WAFFO_PRODUCT_ID")),
      );
      return paymentMethodItem({
        id: "waffo",
        enabled,
        label: options.label?.trim() || "Waffo Pancake",
        currency: normalizeCurrency(ctx.env("WAFFO_CURRENCY")) || normalizeCurrency(options.currency) || "usd",
      });
    },
    async createCheckout(input) {
      const merchantId = options.merchant_id ?? input.ctx.env("WAFFO_MERCHANT_ID");
      const privateKey = options.private_key ?? input.ctx.env("WAFFO_PRIVATE_KEY");
      const productId = options.product_id ?? input.ctx.env("WAFFO_PRODUCT_ID");
      if (!merchantId) throw new Error("Waffo merchant id is not configured");
      if (!privateKey) throw new Error("Waffo private key is not configured");
      if (!productId) throw new Error("Waffo product id is not configured");
      const client = createWaffoClient({
        merchant_id: merchantId,
        private_key: privateKey,
        webhook_public_key: options.webhook_public_key ?? input.ctx.env("WAFFO_WEBHOOK_PUBLIC_KEY"),
        api_base_url: options.api_base_url ?? input.ctx.env("WAFFO_API_BASE_URL"),
      });
      const created = await createWaffoCheckoutSession(client, {
        payment_id: input.payment_id,
        topup: input.topup,
        product_id: productId,
        currency: normalizeCurrency(input.ctx.env("WAFFO_CURRENCY")) || normalizeCurrency(options.currency) || "usd",
        success_url: input.success_url,
      });
      return {
        provider_session_id: created.session_id,
        checkout_url: created.checkout_url,
        metadata: { product_id: productId },
      };
    },
    async parseWebhook(input) {
      const client = createWaffoClient({
        merchant_id: options.merchant_id ?? input.ctx.env("WAFFO_MERCHANT_ID") ?? "MER_webhook",
        private_key: options.private_key ?? input.ctx.env("WAFFO_PRIVATE_KEY") ?? fallbackWaffoPrivateKey(),
        webhook_public_key: options.webhook_public_key ?? input.ctx.env("WAFFO_WEBHOOK_PUBLIC_KEY"),
        api_base_url: options.api_base_url ?? input.ctx.env("WAFFO_API_BASE_URL"),
      });
      const event = parseWaffoWebhookEvent({
        client,
        raw: input.raw,
        signature: input.request.headers.get("x-waffo-signature"),
        environment: normalizeWaffoEnvironment(input.ctx.env("WAFFO_ENVIRONMENT") || options.environment),
      });
      const data = readWaffoMetadata(event.data);
      const metadata = readWaffoMetadata(data.orderMetadata);
      const orderId = normalizeOptionalText(data.orderId);
      const paymentId = normalizeOptionalText(data.paymentId) || normalizeOptionalText(event.eventId);
      const type = normalizeOptionalText(event.eventType) || "unknown";
      return {
        event_id: normalizeRequired(event.id || event.eventId || `evt_${randomId()}`, "waffo event id"),
        type,
        payload: event,
        status: type === "order.completed" ? "paid" : "ignored",
        payment_id: normalizeOptionalText(data.orderMerchantExternalId),
        topup_id: normalizeOptionalText(metadata.topup_id),
        provider_payment_id: paymentId,
        provider_order_id: orderId,
        ref: paymentId || orderId,
        meta: {
          provider: "waffo",
          waffo_event_id: normalizeOptionalText(event.id || event.eventId),
          waffo_order_id: orderId,
          waffo_payment_id: paymentId,
        },
      };
    },
  };
}

/**
 * 读取 Creem webhook 事件对象。
 */
function readCreemEventObject(event: Record<string, unknown>): Record<string, unknown> {
  const directObject = readCreemMetadata(event.object);
  if (Object.keys(directObject).length > 0) return directObject;
  return readCreemMetadata((event.data as { object?: unknown } | undefined)?.object);
}

/**
 * Waffo webhook-only fallback 私钥。
 *
 * 关键点（中文）
 * - 仅用于 webhook-only 场景，让 SDK 能完成签名验证流程。
 * - 不会用于任何真实请求，真实请求必须配置 WAFFO_PRIVATE_KEY。
 */
function fallbackWaffoPrivateKey(): string {
  return [
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIEpAIBAAKCAQEAtAqPA17F1sr9kylJy8LbcaHrim/UocR/ur3z5Vu7QQTUhuPO",
    "pbsYnu1oFGwCsCjFhBBapI8/Huy9ARP3/Oxsp4kna9gEPLRSTMfUK5a0nPUnkHXv",
    "DFgzIFYn1Yac/3FiA4zIA5BH+0ZUBu8cFZ1MvaPu7YFQvr165hOmwLnoJsypcY5V",
    "Kjb8p+HjMXyiCy3gUId2DCJuUhjbtUo84gI3v4YAI6YD07pNUSm5wFDFKsYeymdV",
    "QdtBhgPUx0RJDyhOKU1Vq8mge2b03ZiQK3O3gUmQgP0sAUpyyUrHaMjs/nAw9dqy",
    "Wl0VyglAIcl79sRVUXTHgEHGf+j0pNcyVjIF2QIDAQABAoIBAAM1bPcSaVQ6qepF",
    "ghsvjdmomRoOhCud5OjfGcmsqNmvzFnbFYO+oeGzOXejtSiOkXaZFAR6yRU0AupS",
    "AMlxLT6PIzS41NqAHDdiGFXuiamCdQIOGASQTdj1sCAOFh43VxfZGnd1ytKfnj/B",
    "Yy6/bu6yTT/OXjIIDnirQP2OUqTeWTHdf1xgQGkb+y20Oo3JgJ637j67HuLPrpzs",
    "jIluqhRszKwVWhGlyTYJdK8nOv2sn+Kn8cEFybmbcytWk9Sxf128+IjTgsEFgEcy",
    "RS6/UofjKfh9WY+4DK/L7mQgdYwawiRX4y4MkExCusmQxT72mDVGXnSbTYNp2qZl",
    "WEgFeQECgYEA8cgKGrySiDFxJb900I5O/CL+1pIYXy6K4gDLk70luwjRSWU+ufZo",
    "g/IRntgk0b0eC4vzP6539hQsh8rrO2swv0vBDG/cvyjP7ljHTx0pFtAjb/yJ9PXN",
    "ca08G8qx6BX5mqdD46T56V4g5PtLT6cwn5Hth2/H+4MZ/5osP3CbU0UCgYEAvqEJ",
    "OEOlKMRhxdfb7RnKMwiXUN2vZ0NuGgK0slqEC9FAv1E/XV8azcs40uINrDdieRmr",
    "Oi+LBXC08FHiAKZOVuxg1DzKx8gDc/R6YGT5sKVhVhKgWsF9ysmCyyqdqnuvFMAd",
    "7PgS4Nf01rO9jo+cqKBHTzFny0TWZTTAR6NzZ4UCgYEAzqcKs+V/XPbdXcUxg9xO",
    "eEU1CZLfT+NJA3hoiAMAD8eukgv+PBX3KOeq1diqR7ZbysS4iTKHCAYgNYRj4Gpy",
    "xN5rx0SJKb4pUvAAkoc7CmumDl6MT5oUGdhWau6pdtPpfpz+csEcdbFlbjG3IgKl",
    "lY21tq/8/uUEQKq2rRaDO/0CgYAUgC0FqACzCauaI0S7kvJz2pCrWavrZw0ILxJP",
    "u/xHaRGVgZ9W40t2pkxOIZFm2+3zKBeKAmLpCt3qmmO7vibeoj0nlgIYyiHU7o3a",
    "oAFaRe7Z2tbz66sji9hNESAznWmOybpuKZ+eHptuG5ZfJoKqf9IrahzHd3e3Gp0z",
    "FxjqIQKBgQDbHuXgZL8A7pQe+YFUVbXYjhzb+sTlVQD7C4KF0sdiKNKXcXhvcCxL",
    "AfJu59vnIlhD4MUcxt5lWDBLX08dmcJOX2AryDMmNVC7knNu92IehJeboSaM1+t3",
    "1V/8pTMTtzg5ANHzZICj6vn46UXCL78XUC3sqZdAm/+9kS+oAnWaIw==",
    "-----END RSA PRIVATE KEY-----",
  ].join("\n");
}
