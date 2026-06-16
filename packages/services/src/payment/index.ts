/**
 * Downcity 官方 Payment 统一服务。
 *
 * 关键说明（中文）
 * - payment 是唯一支付服务，Stripe / Creem / Dodo / Waffo 都只是 provider。
 * - 统一负责 checkout、本地支付记录、webhook 幂等、状态同步和 balance 入账。
 * - 所有 provider 共用 `/v1/payment/*` 路由和统一 payments/events 表。
 */

import type { EnvRequirement, ServiceDefinition } from "@downcity/city";
import { createCreemCheckoutSession, normalizeCreemApiBaseURL, parseCreemWebhookEvent, readMetadata as readCreemMetadata, verifyCreemSignature } from "../payment-creem/creem.ts";
import { createDodoCheckoutSession, createDodoClient, normalizeDodoEnvironment, parseDodoWebhookEvent, readMetadata as readDodoMetadata } from "../payment-dodo/dodo.ts";
import { createStripeCheckoutSession, normalizeStripeApiBaseURL, parseStripeWebhookEvent, readMetadata as readStripeMetadata, verifyStripeSignature } from "../payment-stripe/stripe.ts";
import { createWaffoCheckoutSession, createWaffoClient, normalizeWaffoEnvironment, parseWaffoWebhookEvent, readMetadata as readWaffoMetadata } from "../payment-waffo/waffo.ts";
import { paymentEvents, paymentPayments } from "./schema.ts";
import { resolvePaymentRedirectURL } from "./redirect.ts";
import type {
  CreemPaymentProviderOptions,
  DodoPaymentProviderOptions,
  PaymentCheckoutCreateResult,
  PaymentCreateCheckoutInput,
  PaymentEventRecord,
  PaymentEventSyncStatus,
  PaymentMethodItem,
  PaymentProvider,
  PaymentProviderCheckoutInput,
  PaymentProviderContext,
  PaymentProviderWebhookEvent,
  PaymentProviderWebhookInput,
  PaymentRecord,
  PaymentServiceOptions,
  PaymentStatus,
  StripePaymentProviderOptions,
  WaffoPaymentProviderOptions,
} from "./types.ts";

type PaymentTable = {
  select(where?: Partial<PaymentRecord>): Promise<PaymentRecord[]>;
  insert(row: PaymentRecord): Promise<unknown>;
  update(input: {
    where: Partial<PaymentRecord>;
    values: Partial<PaymentRecord>;
  }): Promise<unknown>;
};

type EventTable = {
  select(where?: Partial<PaymentEventRecord>): Promise<PaymentEventRecord[]>;
  insert(row: PaymentEventRecord): Promise<unknown>;
  update(input: {
    where: Partial<PaymentEventRecord>;
    values: Partial<PaymentEventRecord>;
  }): Promise<unknown>;
};

/**
 * Payment 服务自身 env。
 */
const paymentEnv: EnvRequirement[] = [
  {
    key: "DOWNCITY_CITY_BASE_URL",
    description: "City 对外访问地址；用于自动生成统一 payment 结果页地址",
    required: false,
  },
];

/**
 * 创建统一 Payment 服务。
 */
export function paymentService(options: PaymentServiceOptions): ServiceDefinition {
  const providers = normalizeProviders(options.providers);
  const env = mergeEnvRequirements([
    ...paymentEnv,
    ...providers.flatMap((provider) => provider.env),
  ]);

  return {
    id: "payment",
    name: "Payment",
    version: "0.2.0",
    env,
    schema: {
      payments: paymentPayments,
      events: paymentEvents,
    },
    instruction: [
      "统一支付服务。Stripe、Creem、Dodo、Waffo 都作为 provider 挂载。",
      "前端先读取 /methods，再通过 /checkout/create 创建对应 provider 的 checkout。",
      "所有 provider 共用 /webhook、/payments、/events 和统一 payment 表。",
    ].join("\n"),
    install(ctx) {
      const payments = ctx.table<PaymentRecord>("payments") as PaymentTable;
      const events = ctx.table<PaymentEventRecord>("events") as EventTable;

      ctx.route({
        method: "GET",
        path: "/methods",
        auth: [],
        handler(requestCtx) {
          return requestCtx.jsonResponse({
            items: providers.map((provider) => provider.method(ctx)),
          });
        },
      });

      ctx.route({
        method: "POST",
        path: "/checkout/create",
        auth: ["user"],
        async handler(requestCtx) {
          const body = await requestCtx.json<PaymentCreateCheckoutInput>();
          const provider = readProvider(providers, body.method_id || body.provider);
          const method = provider.method(ctx);
          if (!method.enabled) {
            const reason = method.reason ? `: ${method.reason}` : "";
            return requestCtx.jsonResponse({ error: `Payment provider ${provider.id} is disabled${reason}` }, 400);
          }

          const userId = normalizeRequired(requestCtx.user?.user_id, "user_id");
          const topup = await options.balance.readTopup(normalizeRequired(body.topup_id, "topup_id"));
          if (topup.user_id !== userId) {
            return requestCtx.jsonResponse({ error: "Topup does not belong to current user" }, 403);
          }
          if (topup.status !== "pending") {
            return requestCtx.jsonResponse({ error: `Topup is already ${topup.status}` }, 409);
          }

          const existing = await findActivePaymentByTopup(payments, provider.id, topup.topup_id);
          if (existing) return requestCtx.jsonResponse(toCheckoutResult(existing));

          const paymentId = `pay_${randomId()}`;
          const successURL = resolvePaymentRedirectURL({
            path: "/v1/payment/redirect/success",
            ctx,
            request: requestCtx.request,
          });
          const cancelURL = resolvePaymentRedirectURL({
            path: "/v1/payment/redirect/cancel",
            ctx,
            request: requestCtx.request,
          });

          const created = await provider.createCheckout({
            payment_id: paymentId,
            topup,
            request: requestCtx.request,
            ctx,
            success_url: successURL,
            cancel_url: cancelURL,
          });
          const now = new Date().toISOString();
          const row: PaymentRecord = {
            payment_id: paymentId,
            provider: provider.id,
            topup_id: topup.topup_id,
            user_id: topup.user_id,
            provider_session_id: normalizeOptionalText(created.provider_session_id),
            provider_payment_id: normalizeOptionalText(created.provider_payment_id),
            provider_order_id: normalizeOptionalText(created.provider_order_id),
            amount: topup.amount,
            currency: method.currency,
            status: "pending",
            checkout_url: created.checkout_url,
            metadata_json: JSON.stringify({
              note: topup.note,
              provider: provider.id,
              ...(created.metadata ?? {}),
            }),
            created_at: now,
            updated_at: now,
          };
          await payments.insert(row);
          return requestCtx.jsonResponse(toCheckoutResult(row));
        },
      });

      ctx.route({
        method: "GET",
        path: "/payments/me",
        auth: ["user"],
        async handler(requestCtx) {
          const userId = normalizeRequired(requestCtx.user?.user_id, "user_id");
          return requestCtx.jsonResponse({ items: sortPayments(await payments.select({ user_id: userId })) });
        },
      });

      ctx.route({
        method: "GET",
        path: "/payments",
        auth: ["admin"],
        async handler(requestCtx) {
          return requestCtx.jsonResponse({ items: sortPayments(await payments.select()) });
        },
      });

      ctx.route({
        method: "GET",
        path: "/events",
        auth: ["admin"],
        async handler(requestCtx) {
          return requestCtx.jsonResponse({ items: sortEvents(await events.select()) });
        },
      });

      ctx.route({
        method: "POST",
        path: "/webhook",
        auth: [],
        async handler(requestCtx) {
          const raw = await requestCtx.text();
          const provider = readWebhookProvider(providers, requestCtx.request);
          let webhookEvent: PaymentProviderWebhookEvent;

          try {
            webhookEvent = provider
              ? await provider.parseWebhook({ raw, request: requestCtx.request, ctx })
              : await autoParseWebhook(providers, { raw, request: requestCtx.request, ctx });
          } catch (error) {
            return requestCtx.jsonResponse({ error: errorMessage(error) }, 400);
          }

          const eventProvider = provider ?? readProvider(providers, webhookEvent.meta?.provider);
          const eventId = `${eventProvider.id}:${normalizeRequired(webhookEvent.event_id, "payment event id")}`;
          const existing = (await events.select({ event_id: eventId }))[0];
          if (existing) {
            return requestCtx.jsonResponse({
              received: true,
              event_id: eventId,
              provider: eventProvider.id,
              sync_status: existing.sync_status,
            });
          }

          await events.insert({
            event_id: eventId,
            provider: eventProvider.id,
            type: webhookEvent.type,
            payload_json: JSON.stringify(webhookEvent.payload),
            sync_status: "pending",
            sync_error: "",
            created_at: new Date().toISOString(),
          });

          try {
            const syncStatus = await syncPaymentEvent({
              provider: eventProvider,
              event: webhookEvent,
              payments,
              balance: options.balance,
            });
            await updateEvent(events, eventId, syncStatus, "");
            return requestCtx.jsonResponse({
              received: true,
              event_id: eventId,
              provider: eventProvider.id,
              sync_status: syncStatus,
            });
          } catch (error) {
            const message = errorMessage(error);
            await updateEvent(events, eventId, "failed", message);
            return requestCtx.jsonResponse({
              received: true,
              event_id: eventId,
              provider: eventProvider.id,
              sync_status: "failed",
              error: message,
            }, 500);
          }
        },
      });

      ctx.route({
        method: "GET",
        path: "/redirect/success",
        auth: [],
        handler(requestCtx) {
          return htmlResponse(renderRedirectPage({
            title: "Payment successful",
            heading: "Payment completed",
            description: "Your payment has been accepted. If the balance view has not refreshed yet, close this page and return to your app.",
            request: requestCtx.request,
          }));
        },
      });

      ctx.route({
        method: "GET",
        path: "/redirect/cancel",
        auth: [],
        handler(requestCtx) {
          return htmlResponse(renderRedirectPage({
            title: "Payment canceled",
            heading: "Payment canceled",
            description: "No charge was completed. You can close this page and return to your app to try again later.",
            request: requestCtx.request,
          }));
        },
      });
    },
  };
}

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

async function syncPaymentEvent(input: {
  provider: PaymentProvider;
  event: PaymentProviderWebhookEvent;
  payments: PaymentTable;
  balance: PaymentServiceOptions["balance"];
}): Promise<PaymentEventSyncStatus> {
  const { provider, event, payments, balance } = input;
  if (event.status === "ignored") return "ignored";

  const payment = await findPaymentByWebhookEvent(payments, provider.id, event);
  if (!payment) return "ignored";
  if (event.status === "paid" && payment.status === "paid") return "applied";
  if (payment.status !== "pending" && event.status !== "paid") return "ignored";

  if (event.status === "paid") {
    const topup = await balance.readTopup(payment.topup_id);
    if (topup.status === "pending") {
      await balance.finishTopup(payment.topup_id, {
        note: `${provider.id} topup`,
        ref: event.ref || event.provider_payment_id || event.provider_order_id || event.provider_session_id || payment.provider_session_id,
        meta: {
          provider: provider.id,
          payment_id: payment.payment_id,
          provider_session_id: event.provider_session_id || payment.provider_session_id,
          provider_payment_id: event.provider_payment_id || payment.provider_payment_id,
          provider_order_id: event.provider_order_id || payment.provider_order_id,
          ...(event.meta ?? {}),
        },
      });
    }
  }

  await updatePayment(payments, payment.payment_id, {
    status: event.status,
    provider_session_id: event.provider_session_id || payment.provider_session_id,
    provider_payment_id: event.provider_payment_id || payment.provider_payment_id,
    provider_order_id: event.provider_order_id || payment.provider_order_id,
  });
  return "applied";
}

async function findPaymentByWebhookEvent(
  payments: PaymentTable,
  provider: string,
  event: PaymentProviderWebhookEvent,
): Promise<PaymentRecord | undefined> {
  if (event.payment_id) {
    const record = (await payments.select({ payment_id: event.payment_id, provider }))[0];
    if (record) return record;
  }
  if (event.provider_session_id) {
    const record = (await payments.select({ provider, provider_session_id: event.provider_session_id }))[0];
    if (record) return record;
  }
  if (event.provider_payment_id) {
    const record = (await payments.select({ provider, provider_payment_id: event.provider_payment_id }))[0];
    if (record) return record;
  }
  if (event.provider_order_id) {
    const record = (await payments.select({ provider, provider_order_id: event.provider_order_id }))[0];
    if (record) return record;
  }
  if (event.topup_id) return await findActivePaymentByTopup(payments, provider, event.topup_id);
  return undefined;
}

async function findActivePaymentByTopup(
  payments: PaymentTable,
  provider: string,
  topupId: string,
): Promise<PaymentRecord | undefined> {
  const rows = sortPayments(await payments.select({ provider, topup_id: topupId }));
  return rows.find((row) => row.status === "pending");
}

async function updatePayment(
  payments: PaymentTable,
  paymentId: string,
  input: {
    status: PaymentStatus;
    provider_session_id?: string;
    provider_payment_id?: string;
    provider_order_id?: string;
  },
): Promise<void> {
  await payments.update({
    where: { payment_id: paymentId },
    values: {
      status: input.status,
      provider_session_id: normalizeOptionalText(input.provider_session_id),
      provider_payment_id: normalizeOptionalText(input.provider_payment_id),
      provider_order_id: normalizeOptionalText(input.provider_order_id),
      updated_at: new Date().toISOString(),
    },
  });
}

async function updateEvent(
  events: EventTable,
  eventId: string,
  syncStatus: PaymentEventSyncStatus,
  syncError: string,
): Promise<void> {
  await events.update({
    where: { event_id: eventId },
    values: {
      sync_status: syncStatus,
      sync_error: syncError.trim(),
    },
  });
}

function toCheckoutResult(row: PaymentRecord): PaymentCheckoutCreateResult {
  return {
    payment_id: row.payment_id,
    provider: row.provider,
    topup_id: row.topup_id,
    provider_session_id: row.provider_session_id,
    provider_payment_id: row.provider_payment_id,
    provider_order_id: row.provider_order_id,
    checkout_url: row.checkout_url,
    status: row.status,
  };
}

function readProvider(providers: PaymentProvider[], value: unknown): PaymentProvider {
  const id = normalizeOptionalText(value);
  if (!id) throw new TypeError("payment method_id is required");
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error(`Payment provider ${id} is not available`);
  return provider;
}

function readWebhookProvider(providers: PaymentProvider[], request: Request): PaymentProvider | undefined {
  const url = new URL(request.url);
  const explicit = normalizeOptionalText(url.searchParams.get("provider"));
  if (explicit) return readProvider(providers, explicit);

  if (request.headers.has("stripe-signature")) return providers.find((provider) => provider.id === "stripe");
  if (request.headers.has("creem-signature")) return providers.find((provider) => provider.id === "creem");
  if (request.headers.has("x-waffo-signature")) return providers.find((provider) => provider.id === "waffo");
  if (request.headers.has("webhook-signature") || request.headers.has("svix-signature")) {
    return providers.find((provider) => provider.id === "dodo");
  }
  return undefined;
}

async function autoParseWebhook(
  providers: PaymentProvider[],
  input: PaymentProviderWebhookInput,
): Promise<PaymentProviderWebhookEvent> {
  for (const provider of providers) {
    try {
      const event = await provider.parseWebhook(input);
      return {
        ...event,
        meta: {
          ...(event.meta ?? {}),
          provider: provider.id,
        },
      };
    } catch {
      // 关键点（中文）：自动识别只是兜底，单个 provider 解析失败继续尝试下一个。
    }
  }
  throw new Error("Payment webhook provider is required");
}

function normalizeProviders(providers: PaymentProvider[]): PaymentProvider[] {
  const normalized: PaymentProvider[] = [];
  for (const provider of providers) {
    if (!provider?.id?.trim()) throw new TypeError("payment provider id is required");
    if (normalized.find((item) => item.id === provider.id)) {
      throw new TypeError(`Duplicate payment provider: ${provider.id}`);
    }
    normalized.push(provider);
  }
  return normalized;
}

function mergeEnvRequirements(items: EnvRequirement[]): EnvRequirement[] {
  const result: EnvRequirement[] = [];
  for (const item of items) {
    if (result.find((existing) => existing.key === item.key)) continue;
    result.push(item);
  }
  return result;
}

function paymentMethodItem(input: {
  id: string;
  enabled: boolean;
  label: string;
  currency: string;
}): PaymentMethodItem {
  return {
    id: input.id,
    type: "checkout",
    enabled: input.enabled,
    label: input.label,
    service: "payment",
    action: "checkout/create",
    requires_user: true,
    currency: input.currency,
    reason: input.enabled ? undefined : "not_configured",
  };
}

function readCreemEventObject(event: Record<string, unknown>): Record<string, unknown> {
  const directObject = readCreemMetadata(event.object);
  if (Object.keys(directObject).length > 0) return directObject;
  return readCreemMetadata((event.data as { object?: unknown } | undefined)?.object);
}

function readObjectId(object: Record<string, unknown>): string {
  return normalizeOptionalText(object.id);
}

function sortPayments(rows: PaymentRecord[]): PaymentRecord[] {
  return [...rows].sort((left, right) => {
    if (left.updated_at === right.updated_at) return right.created_at.localeCompare(left.created_at);
    return right.updated_at.localeCompare(left.updated_at);
  });
}

function sortEvents(rows: PaymentEventRecord[]): PaymentEventRecord[] {
  return [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function normalizeRequired(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCurrency(value: unknown): string {
  return normalizeOptionalText(value).toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function renderRedirectPage(input: {
  title: string;
  heading: string;
  description: string;
  request: Request;
}): string {
  const homeURL = escapeHTML(new URL("/", input.request.url).toString());
  const title = escapeHTML(input.title);
  const heading = escapeHTML(input.heading);
  const description = escapeHTML(input.description);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; --bg: #f5f7fb; --card: #fff; --text: #142033; --muted: #5a6a85; --border: #d9e2f1; --accent: #1f6feb; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%); color: var(--text); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(100%, 560px); padding: 32px; border: 1px solid var(--border); border-radius: 20px; background: var(--card); box-shadow: 0 18px 60px rgba(16, 24, 40, 0.08); }
      h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.2; }
      p { margin: 0; color: var(--muted); }
      a { display: inline-block; margin-top: 24px; color: #fff; background: var(--accent); text-decoration: none; padding: 12px 16px; border-radius: 999px; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <p>${description}</p>
      <a href="${homeURL}">Return to Downcity</a>
    </main>
  </body>
</html>`;
}

function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function randomId(): string {
  const buffer = new Uint8Array(12);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

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
