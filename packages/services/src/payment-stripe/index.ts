/**
 * Downcity Stripe 一次性充值服务。
 *
 * 关键说明（中文）
 * - 当前版本只处理 Stripe 一次性充值
 * - 不处理 entitlement，也不处理 subscription
 * - 支付成功后统一调用 balance.finishTopup() 完成到账
 */

import type { ServiceDefinition, EnvRequirement } from "@downcity/city";
import { resolvePaymentRedirectURL } from "../payment/redirect.js";
import { stripeEvents, stripePayments } from "./schema.js";
import {
  createStripeCheckoutSession,
  normalizeOptionalText,
  normalizeRequired,
  normalizeStripeApiBaseURL,
  parseStripeWebhookEvent,
  readMetadata,
  verifyStripeSignature,
} from "./stripe.js";
import type {
  StripeCheckoutCreateResult,
  StripeCreateCheckoutInput,
  StripeEventRecord,
  StripeEventSyncStatus,
  StripePaymentServiceOptions,
  StripePaymentRecord,
  StripePaymentStatus,
  StripeWebhookEvent,
} from "./types.js";

type PaymentTable = {
  select(where?: Partial<StripePaymentRecord>): Promise<StripePaymentRecord[]>;
  insert(row: StripePaymentRecord): Promise<unknown>;
  update(input: {
    where: Partial<StripePaymentRecord>;
    values: Partial<StripePaymentRecord>;
  }): Promise<unknown>;
};

type EventTable = {
  select(where?: Partial<StripeEventRecord>): Promise<StripeEventRecord[]>;
  insert(row: StripeEventRecord): Promise<unknown>;
  update(input: {
    where: Partial<StripeEventRecord>;
    values: Partial<StripeEventRecord>;
  }): Promise<unknown>;
};

interface NormalizedStripePaymentServiceOptions {
  balance: StripePaymentServiceOptions["balance"];
  secret_key?: string;
  webhook_secret?: string;
  currency: string;
  item_name: string;
  api_base_url: string;
}

/**
 * Stripe 服务对外暴露的运行时环境变量。
 *
 * 关键说明（中文）
 * - secret / webhook 是最常见的宿主注入配置
 * - 默认跳转页统一基于 DOWNCITY_CITY_BASE_URL 生成
 * - currency / item name / api server URL 提供可选默认值覆写
 */
const stripePaymentEnv: EnvRequirement[] = [
  {
    key: "STRIPE_SECRET_KEY",
    description: "Stripe secret key，用于创建 Checkout Session",
    required: true,
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    description: "Stripe webhook signing secret，用于校验 stripe-signature",
    required: false,
  },
  {
    key: "DOWNCITY_CITY_BASE_URL",
    description: "City 对外访问地址；用于自动生成 Stripe 默认跳转页地址",
    required: false,
  },
  {
    key: "STRIPE_CURRENCY",
    description: "默认结算币种，例如 usd",
    required: false,
  },
  {
    key: "STRIPE_ITEM_NAME",
    description: "Stripe Checkout 展示的默认商品名",
    required: false,
  },
  {
    key: "STRIPE_API_BASE_URL",
    description: "可选的 Stripe API 基础地址覆写，通常只用于测试环境",
    required: false,
  },
];

export { stripeEvents, stripePayments } from "./schema.js";
export type {
  StripeCheckoutCreateResult,
  StripePaymentServiceBalanceBridge,
  StripeCreateCheckoutInput,
  StripeEventRecord,
  StripeEventSyncStatus,
  StripePaymentServiceOptions,
  StripePaymentRecord,
  StripePaymentStatus,
} from "./types.js";

/**
 * 创建 Stripe 一次性充值服务。
 */
export function stripePaymentService(options: StripePaymentServiceOptions): ServiceDefinition {
  const normalized = normalizeOptions(options);

  return {
    id: "payment.stripe",
    name: "Stripe Payment",
    version: "0.2.0",
    env: stripePaymentEnv,
    schema: {
      payments: stripePayments,
      events: stripeEvents,
    },
    instruction: [
      "使用 Stripe 创建一次性充值 Checkout，并在 webhook 成功后完成 balance topup。",
      "这个服务不处理 entitlement，也不处理 subscription。",
      "当 options 未显式传入时，会回退读取 STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET。",
      "默认 success/cancel URL 统一基于 DOWNCITY_CITY_BASE_URL 自动生成。",
      `currency=${normalized.currency}。`,
      "支付成功后统一通过 balance.finishTopup() 完成到账。",
    ].join("\n"),
    install(ctx) {
      const payments = ctx.table<StripePaymentRecord>("payments") as PaymentTable;
      const events = ctx.table<StripeEventRecord>("events") as EventTable;
      const balance = normalized.balance;

      ctx.route({
        method: "POST",
        path: "/checkout/create",
        auth: ["user"],
        async handler(requestCtx) {
          const body = await requestCtx.json<StripeCreateCheckoutInput>();
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

          const secretKey = normalized.secret_key ?? ctx.env("STRIPE_SECRET_KEY");
          if (!secretKey) {
            return requestCtx.jsonResponse({ error: "Stripe secret key is not configured" }, 500);
          }

          const paymentId = `pay_${randomId()}`;
          const currency = resolveCurrency(normalized, ctx);
          const created = await createStripeCheckoutSession(
            secretKey,
            resolveApiBaseURL(normalized, ctx),
            {
              payment_id: paymentId,
              topup,
              currency,
              success_url: resolvePaymentRedirectURL({
                path: "/v1/payment.stripe/redirect/success",
                ctx,
                request: requestCtx.request,
              }),
              cancel_url: resolvePaymentRedirectURL({
                path: "/v1/payment.stripe/redirect/cancel",
                ctx,
                request: requestCtx.request,
              }),
              item_name: resolveItemName(normalized, ctx),
            },
          );
          const now = new Date().toISOString();
          const row: StripePaymentRecord = {
            payment_id: paymentId,
            topup_id: topup.topup_id,
            user_id: topup.user_id,
            stripe_checkout_session_id: created.session_id,
            stripe_payment_intent_id: created.payment_intent_id,
            amount: topup.amount,
            currency,
            status: "pending",
            checkout_url: created.checkout_url,
            metadata_json: JSON.stringify({
              note: topup.note,
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
          const rows = sortPayments(await payments.select({ user_id: userId }));
          return requestCtx.jsonResponse({ items: rows });
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
          const webhookSecret = normalized.webhook_secret ?? ctx.env("STRIPE_WEBHOOK_SECRET");
          if (webhookSecret) {
            const signature = requestCtx.request.headers.get("stripe-signature");
            const valid = await verifyStripeSignature(raw, signature, webhookSecret);
            if (!valid) return requestCtx.jsonResponse({ error: "Invalid Stripe signature" }, 400);
          }

          const event = parseStripeWebhookEvent(raw);
          const eventId = normalizeRequired(event.id, "stripe event id");
          const eventType = String(event.type ?? "unknown");
          const existing = (await events.select({ event_id: eventId }))[0];
          if (existing) {
            return requestCtx.jsonResponse({
              received: true,
              event_id: eventId,
              sync_status: existing.sync_status,
            });
          }

          const eventRow: StripeEventRecord = {
            event_id: eventId,
            type: eventType,
            payload_json: JSON.stringify(event),
            sync_status: "pending",
            sync_error: "",
            created_at: new Date().toISOString(),
          };
          await events.insert(eventRow);

          try {
            const syncStatus = await syncStripeEvent({
              event,
              payments,
              balance,
            });
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
            description: "Your Stripe payment has been accepted. If the balance view has not refreshed yet, close this page and return to your app.",
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
 * 统一同步 Stripe webhook 事件。
 */
async function syncStripeEvent(input: {
  event: StripeWebhookEvent;
  payments: PaymentTable;
  balance: StripePaymentServiceOptions["balance"];
}): Promise<StripeEventSyncStatus> {
  const { event, payments, balance } = input;
  switch (String(event.type ?? "")) {
    case "checkout.session.completed":
      return await syncCheckoutCompleted(event, payments, balance);
    case "checkout.session.expired":
      return await syncCheckoutExpired(event, payments);
    case "payment_intent.payment_failed":
      return await syncPaymentIntentFailed(event, payments);
    default:
      return "ignored";
  }
}

/**
 * 同步 `checkout.session.completed`。
 */
async function syncCheckoutCompleted(
  event: StripeWebhookEvent,
  payments: PaymentTable,
  balance: StripePaymentServiceOptions["balance"],
): Promise<StripeEventSyncStatus> {
  const object = readMetadata(event.data?.object);
  const payment = await findPaymentByEventObject(payments, object, "stripe_checkout_session_id");
  if (!payment) return "ignored";
  if (payment.status === "paid") return "applied";

  const paymentIntentId = normalizeOptionalText(object.payment_intent);
  const topup = await balance.readTopup(payment.topup_id);
  if (topup.status === "pending") {
    await balance.finishTopup(payment.topup_id, {
      note: "stripe topup",
      ref: normalizeOptionalText(object.id) || payment.stripe_checkout_session_id,
      meta: {
        stripe_event_id: normalizeOptionalText(event.id),
        stripe_checkout_session_id: normalizeOptionalText(object.id),
        stripe_payment_intent_id: paymentIntentId,
        stripe_payment_id: payment.payment_id,
      },
    });
  }

  await updatePayment(payments, payment.payment_id, {
    status: "paid",
    stripe_payment_intent_id: paymentIntentId || payment.stripe_payment_intent_id,
  });
  return "applied";
}

/**
 * 同步 `checkout.session.expired`。
 */
async function syncCheckoutExpired(
  event: StripeWebhookEvent,
  payments: PaymentTable,
): Promise<StripeEventSyncStatus> {
  const object = readMetadata(event.data?.object);
  const payment = await findPaymentByEventObject(payments, object, "stripe_checkout_session_id");
  if (!payment) return "ignored";
  if (payment.status !== "pending") return "ignored";
  await updatePayment(payments, payment.payment_id, { status: "expired" });
  return "applied";
}

/**
 * 同步 `payment_intent.payment_failed`。
 */
async function syncPaymentIntentFailed(
  event: StripeWebhookEvent,
  payments: PaymentTable,
): Promise<StripeEventSyncStatus> {
  const object = readMetadata(event.data?.object);
  const payment = await findPaymentByEventObject(payments, object, "stripe_payment_intent_id");
  if (!payment) return "ignored";
  if (payment.status !== "pending") return "ignored";
  await updatePayment(payments, payment.payment_id, {
    status: "failed",
    stripe_payment_intent_id: normalizeOptionalText(object.id) || payment.stripe_payment_intent_id,
  });
  return "applied";
}

/**
 * 根据 webhook 对象寻找支付记录。
 */
async function findPaymentByEventObject(
  payments: PaymentTable,
  object: Record<string, unknown>,
  primaryField: "stripe_checkout_session_id" | "stripe_payment_intent_id",
): Promise<StripePaymentRecord | undefined> {
  const metadata = readMetadata(object.metadata);
  const paymentId = normalizeOptionalText(metadata.payment_id);
  if (paymentId) {
    const record = (await payments.select({ payment_id: paymentId }))[0];
    if (record) return record;
  }

  const directId = normalizeOptionalText(object.id);
  if (directId) {
    const record = (await payments.select({ [primaryField]: directId } as Partial<StripePaymentRecord>))[0];
    if (record) return record;
  }

  const topupId = normalizeOptionalText(metadata.topup_id) || normalizeOptionalText(object.client_reference_id);
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
): Promise<StripePaymentRecord | undefined> {
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
    status: StripePaymentStatus;
    stripe_payment_intent_id?: string;
  },
): Promise<void> {
  await payments.update({
    where: { payment_id: paymentId },
    values: {
      status: input.status,
      stripe_payment_intent_id: normalizeOptionalText(input.stripe_payment_intent_id),
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
  syncStatus: StripeEventSyncStatus,
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
function toCheckoutResult(row: StripePaymentRecord): StripeCheckoutCreateResult {
  return {
    payment_id: row.payment_id,
    topup_id: row.topup_id,
    stripe_checkout_session_id: row.stripe_checkout_session_id,
    checkout_url: row.checkout_url,
    status: row.status,
  };
}

/**
 * 统一排序支付记录。
 */
function sortPayments(rows: StripePaymentRecord[]): StripePaymentRecord[] {
  return [...rows].sort((left, right) => {
    if (left.updated_at === right.updated_at) return right.created_at.localeCompare(left.created_at);
    return right.updated_at.localeCompare(left.updated_at);
  });
}

/**
 * 统一排序 webhook 事件记录。
 */
function sortEvents(rows: StripeEventRecord[]): StripeEventRecord[] {
  return [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

/**
 * 规范化服务配置。
 */
function normalizeOptions(options: StripePaymentServiceOptions): NormalizedStripePaymentServiceOptions {
  if (!options?.balance) throw new TypeError("Stripe payment service requires a balance service instance");
  return {
    ...options,
    balance: options.balance,
    currency: normalizeCurrency(options.currency) || "usd",
    item_name: normalizeOptionalText(options.item_name) || "Downcity Topup",
    api_base_url: normalizeStripeApiBaseURL(options.api_base_url),
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
  options: NormalizedStripePaymentServiceOptions,
  ctx: { env(key: string): string | undefined },
): string {
  return normalizeCurrency(ctx.env("STRIPE_CURRENCY")) || options.currency || "usd";
}

/**
 * 解析当前请求最终使用的 Checkout 商品名。
 */
function resolveItemName(
  options: NormalizedStripePaymentServiceOptions,
  ctx: { env(key: string): string | undefined },
): string {
  return normalizeOptionalText(ctx.env("STRIPE_ITEM_NAME")) || options.item_name;
}

/**
 * 解析当前请求最终使用的 Stripe API 基础地址。
 */
function resolveApiBaseURL(
  options: NormalizedStripePaymentServiceOptions,
  ctx: { env(key: string): string | undefined },
): string {
  return normalizeStripeApiBaseURL(ctx.env("STRIPE_API_BASE_URL") || options.api_base_url);
}

/**
 * 返回最小 HTML 页面，避免 Stripe 跳回后出现 404。
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
      :root {
        color-scheme: light;
        --bg: #f5f7fb;
        --card: #ffffff;
        --text: #142033;
        --muted: #5a6a85;
        --border: #d9e2f1;
        --accent: #1f6feb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top, #e9f1ff 0, rgba(233, 241, 255, 0) 42%),
          linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
        color: var(--text);
        font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(100%, 560px);
        padding: 32px;
        border: 1px solid var(--border);
        border-radius: 20px;
        background: var(--card);
        box-shadow: 0 18px 60px rgba(16, 24, 40, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: var(--muted);
      }
      a {
        display: inline-block;
        margin-top: 24px;
        color: #fff;
        background: var(--accent);
        text-decoration: none;
        padding: 12px 16px;
        border-radius: 999px;
        font-weight: 600;
      }
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
 * 生成随机 ID。
 */
function randomId(): string {
  const buffer = new Uint8Array(12);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
