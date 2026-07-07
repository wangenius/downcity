/**
 * Payment 服务路由与事件处理。
 *
 * 关键点（中文）
 * - 被 PaymentService.install() 调用，完成所有 /v1/payment/* 路由注册。
 * - 所有 balance 交互通过传入的 service 对象进行，不直接依赖 BalanceService 类型。
 */

import type { ServiceInstallContext } from "@downcity/city";
import { resolvePaymentRedirectURL } from "./redirect.js";
import {
  errorMessage,
  htmlResponse,
  normalizeOptionalText,
  normalizeRequired,
  randomId,
  renderRedirectPage,
} from "./helpers.js";
import type {
  PaymentCheckoutCreateResult,
  PaymentCreateCheckoutInput,
  PaymentEventRecord,
  PaymentEventSyncStatus,
  PaymentProvider,
  PaymentProviderWebhookEvent,
  PaymentProviderWebhookInput,
  PaymentRecord,
  PaymentStatus,
  PaymentTopupRecord,
} from "./types.js";

/**
 * payments 表操作抽象。
 */
type PaymentTable = {
  select(where?: Partial<PaymentRecord>): Promise<PaymentRecord[]>;
  insert(row: PaymentRecord): Promise<unknown>;
  update(input: {
    where: Partial<PaymentRecord>;
    values: Partial<PaymentRecord>;
  }): Promise<unknown>;
};

/**
 * payment_events 表操作抽象。
 */
type EventTable = {
  select(where?: Partial<PaymentEventRecord>): Promise<PaymentEventRecord[]>;
  insert(row: PaymentEventRecord): Promise<unknown>;
  update(input: {
    where: Partial<PaymentEventRecord>;
    values: Partial<PaymentEventRecord>;
  }): Promise<unknown>;
};

/**
 * PaymentService 暴露给 routes 的最小能力。
 *
 * 关键点（中文）
 * - 使用 interface 避免 routes.ts 与 service.ts 之间的循环类型依赖。
 */
interface PaymentServiceLike {
  /** 读取充值单。 */
  readTopup(topup_id: string): Promise<PaymentTopupRecord>;
  /** 完成充值并入账。 */
  finishTopup(topup_id: string, extra?: Record<string, unknown>): Promise<PaymentTopupRecord>;
  /** 获取已挂载的 provider 列表。 */
  getProviders(): PaymentProvider[];
}

/**
 * 注册 Payment 服务路由。
 */
export function installPaymentRoutes(service: PaymentServiceLike, ctx: ServiceInstallContext): void {
  const providers = service.getProviders();
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
      const topup = await service.readTopup(normalizeRequired(body.topup_id, "topup_id"));
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
        credits: topup.credits,
        amount_minor: readPaymentAmountMinor(topup),
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
          service,
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
}

/**
 * 同步 webhook 事件到本地支付记录与 balance。
 */
async function syncPaymentEvent(input: {
  provider: PaymentProvider;
  event: PaymentProviderWebhookEvent;
  payments: PaymentTable;
  service: PaymentServiceLike;
}): Promise<PaymentEventSyncStatus> {
  const { provider, event, payments, service } = input;
  if (event.status === "ignored") return "ignored";

  const payment = await findPaymentByWebhookEvent(payments, provider.id, event);
  if (!payment) return "ignored";
  if (event.status === "paid" && payment.status === "paid") return "applied";
  if (payment.status !== "pending" && event.status !== "paid") return "ignored";

  if (event.status === "paid") {
    const topup = await service.readTopup(payment.topup_id);
    if (topup.status === "pending") {
      await service.finishTopup(payment.topup_id, {
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

/**
 * 根据 webhook 事件查找对应支付记录。
 */
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

/**
 * 查找某充值单对应的最新的 pending 支付记录。
 */
async function findActivePaymentByTopup(
  payments: PaymentTable,
  provider: string,
  topupId: string,
): Promise<PaymentRecord | undefined> {
  const rows = sortPayments(await payments.select({ provider, topup_id: topupId }));
  return rows.find((row) => row.status === "pending");
}

/**
 * 更新支付记录。
 */
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

/**
 * 更新事件同步状态。
 */
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

/**
 * 把 payment 行转成 checkout 创建结果。
 */
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

/**
 * 读取真实支付金额。
 */
function readPaymentAmountMinor(topup: PaymentTopupRecord): number {
  const amount_minor = Number(topup.usd_cents);
  if (!Number.isSafeInteger(amount_minor) || amount_minor <= 0) {
    throw new TypeError("topup.usd_cents is required for payment revenue tracking");
  }
  return amount_minor;
}

/**
 * 读取指定 provider。
 */
function readProvider(providers: PaymentProvider[], value: unknown): PaymentProvider {
  const id = normalizeOptionalText(value);
  if (!id) throw new TypeError("payment method_id is required");
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error(`Payment provider ${id} is not available`);
  return provider;
}

/**
 * 根据请求特征识别 webhook 来源 provider。
 */
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

/**
 * 自动尝试所有 provider 解析 webhook。
 */
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

/**
 * 支付记录按更新时间倒序。
 */
function sortPayments(rows: PaymentRecord[]): PaymentRecord[] {
  return [...rows].sort((left, right) => {
    if (left.updated_at === right.updated_at) return right.created_at.localeCompare(left.created_at);
    return right.updated_at.localeCompare(left.updated_at);
  });
}

/**
 * 事件记录按创建时间倒序。
 */
function sortEvents(rows: PaymentEventRecord[]): PaymentEventRecord[] {
  return [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at));
}
