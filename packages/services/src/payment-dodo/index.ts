/**
 * Downcity Dodo Payments 一次性充值服务。
 *
 * 关键说明（中文）
 * - 当前版本只处理 Dodo Checkout 一次性充值
 * - 不处理 entitlement，也不处理 subscription
 * - 支付成功后统一调用 balance.finishTopup() 完成到账
 */

import type { EnvRequirement, ServiceDefinition } from "@downcity/city";
import { resolvePaymentRedirectURL } from "../payment/redirect.js";
import { dodoEvents, dodoPayments } from "./schema.js";
import {
  createDodoCheckoutSession,
  createDodoClient,
  normalizeDodoEnvironment,
  normalizeOptionalText,
  normalizeRequired,
  parseDodoWebhookEvent,
  readMetadata,
} from "./dodo.js";
import type {
  DodoCheckoutCreateResult,
  DodoCreateCheckoutInput,
  DodoEventRecord,
  DodoEventSyncStatus,
  DodoPaymentRecord,
  DodoPaymentServiceOptions,
  DodoPaymentStatus,
  DodoWebhookEvent,
} from "./types.js";

type PaymentTable = {
  select(where?: Partial<DodoPaymentRecord>): Promise<DodoPaymentRecord[]>;
  insert(row: DodoPaymentRecord): Promise<unknown>;
  update(input: {
    where: Partial<DodoPaymentRecord>;
    values: Partial<DodoPaymentRecord>;
  }): Promise<unknown>;
};

type EventTable = {
  select(where?: Partial<DodoEventRecord>): Promise<DodoEventRecord[]>;
  insert(row: DodoEventRecord): Promise<unknown>;
  update(input: {
    where: Partial<DodoEventRecord>;
    values: Partial<DodoEventRecord>;
  }): Promise<unknown>;
};

interface NormalizedDodoPaymentServiceOptions {
  balance: DodoPaymentServiceOptions["balance"];
  api_key?: string;
  product_id?: string;
  webhook_key?: string;
  environment: "test_mode" | "live_mode";
  currency: string;
  api_base_url?: string;
}

/**
 * Dodo 服务对外暴露的运行时环境变量。
 */
const dodoPaymentEnv: EnvRequirement[] = [
  {
    key: "DODO_PAYMENTS_API_KEY",
    description: "Dodo Payments API key，用于创建 Checkout Session",
    required: true,
  },
  {
    key: "DODO_PRODUCT_ID",
    description: "Dodo product_id，用于创建 Checkout Session",
    required: true,
  },
  {
    key: "DODO_WEBHOOK_KEY",
    description: "Dodo webhook signing key，用于校验 webhook",
    required: false,
  },
  {
    key: "DODO_ENVIRONMENT",
    description: "Dodo SDK 环境：test_mode 或 live_mode；默认 test_mode",
    required: false,
  },
  {
    key: "DOWNCITY_CITY_BASE_URL",
    description: "City 对外访问地址；用于自动生成 Dodo 默认跳转页地址",
    required: false,
  },
  {
    key: "DODO_CURRENCY",
    description: "默认结算币种，例如 usd",
    required: false,
  },
  {
    key: "DODO_API_BASE_URL",
    description: "可选的 Dodo API 基础地址覆写，通常只用于测试环境",
    required: false,
  },
];

export { dodoEvents, dodoPayments } from "./schema.js";
export type {
  DodoCheckoutCreateResult,
  DodoCreateCheckoutInput,
  DodoEventRecord,
  DodoEventSyncStatus,
  DodoPaymentEnvironment,
  DodoPaymentRecord,
  DodoPaymentServiceBalanceBridge,
  DodoPaymentServiceOptions,
  DodoPaymentStatus,
  DodoPaymentTopupRecord,
  DodoWebhookEvent,
} from "./types.js";

/**
 * 创建 Dodo Payments 一次性充值服务。
 */
export function dodoPaymentService(options: DodoPaymentServiceOptions): ServiceDefinition {
  const normalized = normalizeOptions(options);

  return {
    id: "payment.dodo",
    name: "Dodo Payment",
    version: "0.1.0",
    env: dodoPaymentEnv,
    schema: {
      payments: dodoPayments,
      events: dodoEvents,
    },
    instruction: [
      "使用 Dodo Payments 创建一次性充值 Checkout，并在 webhook 成功后完成 balance topup。",
      "这个服务不处理 entitlement，也不处理 subscription。",
      "当 options 未显式传入时，会回退读取 DODO_PAYMENTS_API_KEY / DODO_PRODUCT_ID / DODO_WEBHOOK_KEY。",
      `currency=${normalized.currency}，environment=${normalized.environment}。`,
      "支付成功后统一通过 balance.finishTopup() 完成到账。",
    ].join("\n"),
    install(ctx) {
      const payments = ctx.table<DodoPaymentRecord>("payments") as PaymentTable;
      const events = ctx.table<DodoEventRecord>("events") as EventTable;
      const balance = normalized.balance;

      ctx.route({
        method: "POST",
        path: "/checkout/create",
        auth: ["user"],
        async handler(requestCtx) {
          const body = await requestCtx.json<DodoCreateCheckoutInput>();
          const userId = normalizeRequired(requestCtx.user?.user_id, "user_id");
          const topup = await balance.readTopup(normalizeRequired(body.topup_id, "topup_id"));
          if (topup.user_id !== userId) {
            return requestCtx.jsonResponse({ error: "Topup does not belong to current user" }, 403);
          }
          if (topup.status !== "pending") {
            return requestCtx.jsonResponse({ error: `Topup is already ${topup.status}` }, 409);
          }

          const existing = await findActivePaymentByTopup(payments, topup.topup_id);
          if (existing) {
            return requestCtx.jsonResponse(toCheckoutResult(existing));
          }

          const apiKey = normalized.api_key ?? ctx.env("DODO_PAYMENTS_API_KEY");
          if (!apiKey) return requestCtx.jsonResponse({ error: "Dodo API key is not configured" }, 500);

          const productId = normalized.product_id ?? ctx.env("DODO_PRODUCT_ID");
          if (!productId) return requestCtx.jsonResponse({ error: "Dodo product id is not configured" }, 500);

          const paymentId = `pay_${randomId()}`;
          const currency = resolveCurrency(normalized, ctx);
          const client = createDodoClient({
            api_key: apiKey,
            webhook_key: normalized.webhook_key ?? ctx.env("DODO_WEBHOOK_KEY"),
            environment: resolveEnvironment(normalized, ctx),
            api_base_url: normalized.api_base_url ?? ctx.env("DODO_API_BASE_URL"),
          });
          const created = await createDodoCheckoutSession(client, {
            payment_id: paymentId,
            topup,
            product_id: productId,
            currency,
            return_url: resolvePaymentRedirectURL({
              path: "/v1/payment.dodo/redirect/success",
              ctx,
              request: requestCtx.request,
            }),
            cancel_url: resolvePaymentRedirectURL({
              path: "/v1/payment.dodo/redirect/cancel",
              ctx,
              request: requestCtx.request,
            }),
          });
          const now = new Date().toISOString();
          const row: DodoPaymentRecord = {
            payment_id: paymentId,
            topup_id: topup.topup_id,
            user_id: topup.user_id,
            dodo_checkout_session_id: created.checkout_session_id,
            dodo_payment_id: created.dodo_payment_id,
            amount: topup.amount,
            currency,
            status: "pending",
            checkout_url: created.checkout_url,
            metadata_json: JSON.stringify({
              note: topup.note,
              product_id: productId,
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
          const webhookKey = normalized.webhook_key ?? ctx.env("DODO_WEBHOOK_KEY");
          let event: DodoWebhookEvent;
          try {
            const client = createDodoClient({
              api_key: normalized.api_key ?? ctx.env("DODO_PAYMENTS_API_KEY") ?? "webhook_only",
              webhook_key: webhookKey,
              environment: resolveEnvironment(normalized, ctx),
              api_base_url: normalized.api_base_url ?? ctx.env("DODO_API_BASE_URL"),
            });
            event = parseDodoWebhookEvent({
              client,
              raw,
              headers: requestCtx.request.headers,
              verify: Boolean(webhookKey),
            });
          } catch {
            return requestCtx.jsonResponse({ error: "Invalid Dodo signature" }, 400);
          }

          const eventId = readEventId(event);
          const eventType = readEventType(event);
          const existing = (await events.select({ event_id: eventId }))[0];
          if (existing) {
            return requestCtx.jsonResponse({
              received: true,
              event_id: eventId,
              sync_status: existing.sync_status,
            });
          }

          const eventRow: DodoEventRecord = {
            event_id: eventId,
            type: eventType,
            payload_json: JSON.stringify(event),
            sync_status: "pending",
            sync_error: "",
            created_at: new Date().toISOString(),
          };
          await events.insert(eventRow);

          try {
            const syncStatus = await syncDodoEvent({ event, payments, balance });
            await updateEvent(events, eventId, syncStatus, "");
            return requestCtx.jsonResponse({
              received: true,
              event_id: eventId,
              sync_status: syncStatus,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await updateEvent(events, eventId, "failed", message);
            return requestCtx.jsonResponse({
              received: true,
              event_id: eventId,
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
            description: "Your Dodo payment has been accepted. If the balance view has not refreshed yet, close this page and return to your app.",
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
 * 统一同步 Dodo webhook 事件。
 */
async function syncDodoEvent(input: {
  event: DodoWebhookEvent;
  payments: PaymentTable;
  balance: DodoPaymentServiceOptions["balance"];
}): Promise<DodoEventSyncStatus> {
  const { event, payments, balance } = input;
  switch (readEventType(event)) {
    case "payment.succeeded":
      return await syncPaymentSucceeded(event, payments, balance);
    case "payment.failed":
      return await syncPaymentFailed(event, payments);
    case "payment.cancelled":
    case "payment.canceled":
      return await syncPaymentCanceled(event, payments);
    default:
      return "ignored";
  }
}

/**
 * 同步 `payment.succeeded`。
 */
async function syncPaymentSucceeded(
  event: DodoWebhookEvent,
  payments: PaymentTable,
  balance: DodoPaymentServiceOptions["balance"],
): Promise<DodoEventSyncStatus> {
  const object = readEventObject(event);
  const payment = await findPaymentByEventObject(payments, object);
  if (!payment) return "ignored";
  if (payment.status === "paid") return "applied";

  const dodoPaymentId = readObjectId(object) || normalizeOptionalText(object.payment_id);
  const topup = await balance.readTopup(payment.topup_id);
  if (topup.status === "pending") {
    await balance.finishTopup(payment.topup_id, {
      note: "dodo topup",
      ref: dodoPaymentId || payment.dodo_payment_id || payment.dodo_checkout_session_id,
      meta: {
        dodo_event_id: readEventId(event),
        dodo_checkout_session_id: normalizeOptionalText(object.checkout_session_id) || payment.dodo_checkout_session_id,
        dodo_payment_id: dodoPaymentId,
        dodo_service_payment_id: payment.payment_id,
      },
    });
  }

  await updatePayment(payments, payment.payment_id, {
    status: "paid",
    dodo_payment_id: dodoPaymentId || payment.dodo_payment_id,
  });
  return "applied";
}

/**
 * 同步支付失败事件。
 */
async function syncPaymentFailed(
  event: DodoWebhookEvent,
  payments: PaymentTable,
): Promise<DodoEventSyncStatus> {
  const object = readEventObject(event);
  const payment = await findPaymentByEventObject(payments, object);
  if (!payment) return "ignored";
  if (payment.status !== "pending") return "ignored";
  await updatePayment(payments, payment.payment_id, {
    status: "failed",
    dodo_payment_id: readObjectId(object) || normalizeOptionalText(object.payment_id) || payment.dodo_payment_id,
  });
  return "applied";
}

/**
 * 同步支付取消事件。
 */
async function syncPaymentCanceled(
  event: DodoWebhookEvent,
  payments: PaymentTable,
): Promise<DodoEventSyncStatus> {
  const object = readEventObject(event);
  const payment = await findPaymentByEventObject(payments, object);
  if (!payment) return "ignored";
  if (payment.status !== "pending") return "ignored";
  await updatePayment(payments, payment.payment_id, {
    status: "canceled",
    dodo_payment_id: readObjectId(object) || normalizeOptionalText(object.payment_id) || payment.dodo_payment_id,
  });
  return "applied";
}

/**
 * 根据 webhook 对象寻找支付记录。
 */
async function findPaymentByEventObject(
  payments: PaymentTable,
  object: Record<string, unknown>,
): Promise<DodoPaymentRecord | undefined> {
  const metadata = readMetadata(object.metadata);
  const paymentId = normalizeOptionalText(metadata.payment_id);
  if (paymentId) {
    const record = (await payments.select({ payment_id: paymentId }))[0];
    if (record) return record;
  }

  const dodoPaymentId = readObjectId(object) || normalizeOptionalText(object.payment_id);
  if (dodoPaymentId) {
    const record = (await payments.select({ dodo_payment_id: dodoPaymentId }))[0];
    if (record) return record;
  }

  const checkoutSessionId = normalizeOptionalText(object.checkout_session_id);
  if (checkoutSessionId) {
    const record = (await payments.select({ dodo_checkout_session_id: checkoutSessionId }))[0];
    if (record) return record;
  }

  const topupId = normalizeOptionalText(metadata.topup_id);
  if (topupId) {
    return await findActivePaymentByTopup(payments, topupId);
  }

  return undefined;
}

/**
 * 查询某个 topup 当前的活跃支付记录。
 */
async function findActivePaymentByTopup(
  payments: PaymentTable,
  topupId: string,
): Promise<DodoPaymentRecord | undefined> {
  const rows = sortPayments(await payments.select({ topup_id: topupId }));
  return rows.find((row) => row.status === "pending");
}

/**
 * 更新支付记录。
 */
async function updatePayment(
  payments: PaymentTable,
  paymentId: string,
  input: {
    status: DodoPaymentStatus;
    dodo_payment_id?: string;
  },
): Promise<void> {
  await payments.update({
    where: { payment_id: paymentId },
    values: {
      status: input.status,
      dodo_payment_id: normalizeOptionalText(input.dodo_payment_id),
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * 更新 webhook 同步状态。
 */
async function updateEvent(
  events: EventTable,
  eventId: string,
  syncStatus: DodoEventSyncStatus,
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
 * 将支付记录裁剪为创建 Checkout 的返回结构。
 */
function toCheckoutResult(row: DodoPaymentRecord): DodoCheckoutCreateResult {
  return {
    payment_id: row.payment_id,
    topup_id: row.topup_id,
    dodo_checkout_session_id: row.dodo_checkout_session_id,
    dodo_payment_id: row.dodo_payment_id,
    checkout_url: row.checkout_url,
    status: row.status,
  };
}

/**
 * 统一排序支付记录。
 */
function sortPayments(rows: DodoPaymentRecord[]): DodoPaymentRecord[] {
  return [...rows].sort((left, right) => {
    if (left.updated_at === right.updated_at) return right.created_at.localeCompare(left.created_at);
    return right.updated_at.localeCompare(left.updated_at);
  });
}

/**
 * 统一排序 webhook 事件记录。
 */
function sortEvents(rows: DodoEventRecord[]): DodoEventRecord[] {
  return [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

/**
 * 读取 webhook 事件 ID。
 */
function readEventId(event: DodoWebhookEvent): string {
  return normalizeRequired(event.id || event.event_id || readObjectId(readEventObject(event)) || `evt_${randomId()}`, "dodo event id");
}

/**
 * 读取 webhook 事件类型。
 */
function readEventType(event: DodoWebhookEvent): string {
  return normalizeOptionalText(event.type) || normalizeOptionalText(event.eventType) || "unknown";
}

/**
 * 读取 webhook 事件主体。
 */
function readEventObject(event: DodoWebhookEvent): Record<string, unknown> {
  return readMetadata(event.data || event.object);
}

/**
 * 读取对象 ID。
 */
function readObjectId(object: Record<string, unknown>): string {
  return normalizeOptionalText(object.payment_id) || normalizeOptionalText(object.id);
}

/**
 * 规范化服务配置。
 */
function normalizeOptions(options: DodoPaymentServiceOptions): NormalizedDodoPaymentServiceOptions {
  if (!options?.balance) throw new TypeError("Dodo payment service requires a balance service instance");
  return {
    ...options,
    balance: options.balance,
    environment: normalizeDodoEnvironment(options.environment),
    currency: normalizeCurrency(options.currency) || "usd",
  };
}

/**
 * 规范化币种。
 */
function normalizeCurrency(value: unknown): string {
  return normalizeOptionalText(value).toLowerCase();
}

/**
 * 解析当前请求最终使用的币种。
 */
function resolveCurrency(
  options: NormalizedDodoPaymentServiceOptions,
  ctx: { env(key: string): string | undefined },
): string {
  return normalizeCurrency(ctx.env("DODO_CURRENCY")) || options.currency || "usd";
}

/**
 * 解析当前请求最终使用的 Dodo 环境。
 */
function resolveEnvironment(
  options: NormalizedDodoPaymentServiceOptions,
  ctx: { env(key: string): string | undefined },
): "test_mode" | "live_mode" {
  return normalizeDodoEnvironment(ctx.env("DODO_ENVIRONMENT") || options.environment);
}

/**
 * 返回最小 HTML 页面，避免 Dodo 跳回后出现 404。
 */
function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * 渲染支付完成/取消结果页。
 */
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
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f7fb; color: #142033; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(100%, 560px); padding: 32px; border: 1px solid #d9e2f1; border-radius: 20px; background: #fff; box-shadow: 0 18px 60px rgba(16, 24, 40, 0.08); }
      h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.2; }
      p { margin: 0; color: #5a6a85; }
      a { display: inline-block; margin-top: 24px; color: #fff; background: #1f6feb; text-decoration: none; padding: 12px 16px; border-radius: 999px; font-weight: 600; }
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

/**
 * 最小 HTML 转义，避免文本直接拼进页面时破坏结构。
 */
function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 生成短随机 ID。
 */
function randomId(): string {
  return crypto.randomUUID?.().replaceAll("-", "").slice(0, 16) || Math.random().toString(36).slice(2, 18);
}
