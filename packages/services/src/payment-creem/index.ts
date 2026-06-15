/**
 * Downcity Creem 一次性充值服务。
 *
 * 关键说明（中文）
 * - 当前版本只处理 Creem Checkout 一次性充值
 * - 不处理 entitlement，也不处理 subscription
 * - 支付成功后统一调用 balance.finishTopup() 完成到账
 */

import type { EnvRequirement, ServiceDefinition } from "@downcity/city";
import { resolvePaymentRedirectURL } from "../payment/redirect.js";
import { creemEvents, creemPayments } from "./schema.js";
import {
  createCreemCheckoutSession,
  normalizeCreemApiBaseURL,
  normalizeOptionalText,
  normalizeRequired,
  parseCreemWebhookEvent,
  readMetadata,
  verifyCreemSignature,
} from "./creem.js";
import type {
  CreemCheckoutCreateResult,
  CreemCreateCheckoutInput,
  CreemEventRecord,
  CreemEventSyncStatus,
  CreemPaymentRecord,
  CreemPaymentServiceOptions,
  CreemPaymentStatus,
  CreemWebhookEvent,
} from "./types.js";

type PaymentTable = {
  select(where?: Partial<CreemPaymentRecord>): Promise<CreemPaymentRecord[]>;
  insert(row: CreemPaymentRecord): Promise<unknown>;
  update(input: {
    where: Partial<CreemPaymentRecord>;
    values: Partial<CreemPaymentRecord>;
  }): Promise<unknown>;
};

type EventTable = {
  select(where?: Partial<CreemEventRecord>): Promise<CreemEventRecord[]>;
  insert(row: CreemEventRecord): Promise<unknown>;
  update(input: {
    where: Partial<CreemEventRecord>;
    values: Partial<CreemEventRecord>;
  }): Promise<unknown>;
};

interface NormalizedCreemPaymentServiceOptions {
  balance: CreemPaymentServiceOptions["balance"];
  api_key?: string;
  product_id?: string;
  webhook_secret?: string;
  currency: string;
  api_base_url: string;
}

/**
 * Creem 服务对外暴露的运行时环境变量。
 *
 * 关键说明（中文）
 * - api key / product id 是创建 Checkout 的最小必要配置
 * - webhook secret 用于校验 creem-signature
 * - 默认跳转页统一基于 DOWNCITY_CITY_BASE_URL 生成
 */
const creemPaymentEnv: EnvRequirement[] = [
  {
    key: "CREEM_API_KEY",
    description: "Creem API key，用于创建 Checkout Session",
    required: true,
  },
  {
    key: "CREEM_PRODUCT_ID",
    description: "Creem product_id，用于创建 Checkout Session",
    required: true,
  },
  {
    key: "CREEM_WEBHOOK_SECRET",
    description: "Creem webhook signing secret，用于校验 creem-signature",
    required: false,
  },
  {
    key: "DOWNCITY_CITY_BASE_URL",
    description: "City 对外访问地址；用于自动生成 Creem 默认跳转页地址",
    required: false,
  },
  {
    key: "CREEM_CURRENCY",
    description: "默认结算币种，例如 usd；仅用于支付目录展示和本地记录",
    required: false,
  },
  {
    key: "CREEM_API_BASE_URL",
    description: "可选的 Creem API 基础地址覆写，通常只用于测试环境",
    required: false,
  },
];

export { creemEvents, creemPayments } from "./schema.js";
export type {
  CreemCheckoutCreateResult,
  CreemCreateCheckoutInput,
  CreemEventRecord,
  CreemEventSyncStatus,
  CreemPaymentRecord,
  CreemPaymentServiceBalanceBridge,
  CreemPaymentServiceOptions,
  CreemPaymentStatus,
  CreemPaymentTopupRecord,
  CreemWebhookEvent,
} from "./types.js";

/**
 * 创建 Creem 一次性充值服务。
 */
export function creemPaymentService(options: CreemPaymentServiceOptions): ServiceDefinition {
  const normalized = normalizeOptions(options);

  return {
    id: "payment.creem",
    name: "Creem Payment",
    version: "0.1.0",
    env: creemPaymentEnv,
    schema: {
      payments: creemPayments,
      events: creemEvents,
    },
    instruction: [
      "使用 Creem 创建一次性充值 Checkout，并在 webhook 成功后完成 balance topup。",
      "这个服务不处理 entitlement，也不处理 subscription。",
      "当 options 未显式传入时，会回退读取 CREEM_API_KEY / CREEM_PRODUCT_ID / CREEM_WEBHOOK_SECRET。",
      "默认 success URL 统一基于 DOWNCITY_CITY_BASE_URL 自动生成。",
      `currency=${normalized.currency}。`,
      "支付成功后统一通过 balance.finishTopup() 完成到账。",
    ].join("\n"),
    install(ctx) {
      const payments = ctx.table<CreemPaymentRecord>("payments") as PaymentTable;
      const events = ctx.table<CreemEventRecord>("events") as EventTable;
      const balance = normalized.balance;

      ctx.route({
        method: "POST",
        path: "/checkout/create",
        auth: ["user"],
        async handler(requestCtx) {
          const body = await requestCtx.json<CreemCreateCheckoutInput>();
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

          const apiKey = normalized.api_key ?? ctx.env("CREEM_API_KEY");
          if (!apiKey) {
            return requestCtx.jsonResponse({ error: "Creem API key is not configured" }, 500);
          }

          const productId = normalized.product_id ?? ctx.env("CREEM_PRODUCT_ID");
          if (!productId) {
            return requestCtx.jsonResponse({ error: "Creem product id is not configured" }, 500);
          }

          const paymentId = `pay_${randomId()}`;
          const currency = resolveCurrency(normalized, ctx);
          const created = await createCreemCheckoutSession(
            apiKey,
            resolveApiBaseURL(normalized, ctx),
            {
              payment_id: paymentId,
              topup,
              product_id: productId,
              success_url: resolvePaymentRedirectURL({
                path: "/v1/payment.creem/redirect/success",
                ctx,
                request: requestCtx.request,
              }),
            },
          );
          const now = new Date().toISOString();
          const row: CreemPaymentRecord = {
            payment_id: paymentId,
            topup_id: topup.topup_id,
            user_id: topup.user_id,
            creem_checkout_id: created.checkout_id,
            creem_order_id: "",
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
          const webhookSecret = normalized.webhook_secret ?? ctx.env("CREEM_WEBHOOK_SECRET");
          if (webhookSecret) {
            const signature = requestCtx.request.headers.get("creem-signature");
            const valid = await verifyCreemSignature(raw, signature, webhookSecret);
            if (!valid) return requestCtx.jsonResponse({ error: "Invalid Creem signature" }, 400);
          }

          const event = parseCreemWebhookEvent(raw);
          const eventId = normalizeRequired(event.id, "creem event id");
          const eventType = readEventType(event);
          const existing = (await events.select({ event_id: eventId }))[0];
          if (existing) {
            return requestCtx.jsonResponse({
              received: true,
              event_id: eventId,
              sync_status: existing.sync_status,
            });
          }

          const eventRow: CreemEventRecord = {
            event_id: eventId,
            type: eventType,
            payload_json: JSON.stringify(event),
            sync_status: "pending",
            sync_error: "",
            created_at: new Date().toISOString(),
          };
          await events.insert(eventRow);

          try {
            const syncStatus = await syncCreemEvent({
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
            description: "Your Creem payment has been accepted. If the balance view has not refreshed yet, close this page and return to your app.",
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
 * 统一同步 Creem webhook 事件。
 */
async function syncCreemEvent(input: {
  event: CreemWebhookEvent;
  payments: PaymentTable;
  balance: CreemPaymentServiceOptions["balance"];
}): Promise<CreemEventSyncStatus> {
  const { event, payments, balance } = input;
  switch (readEventType(event)) {
    case "checkout.completed":
      return await syncCheckoutCompleted(event, payments, balance);
    case "checkout.expired":
      return await syncCheckoutExpired(event, payments);
    case "checkout.failed":
    case "payment.failed":
      return await syncCheckoutFailed(event, payments);
    default:
      return "ignored";
  }
}

/**
 * 同步 `checkout.completed`。
 */
async function syncCheckoutCompleted(
  event: CreemWebhookEvent,
  payments: PaymentTable,
  balance: CreemPaymentServiceOptions["balance"],
): Promise<CreemEventSyncStatus> {
  const object = readEventObject(event);
  const payment = await findPaymentByEventObject(payments, object);
  if (!payment) return "ignored";
  if (payment.status === "paid") return "applied";

  const orderId = readObjectId(readMetadata(object.order)) || normalizeOptionalText(object.order_id);
  const topup = await balance.readTopup(payment.topup_id);
  if (topup.status === "pending") {
    await balance.finishTopup(payment.topup_id, {
      note: "creem topup",
      ref: orderId || readObjectId(object) || payment.creem_checkout_id,
      meta: {
        creem_event_id: normalizeOptionalText(event.id),
        creem_checkout_id: readObjectId(object) || payment.creem_checkout_id,
        creem_order_id: orderId,
        creem_payment_id: payment.payment_id,
      },
    });
  }

  await updatePayment(payments, payment.payment_id, {
    status: "paid",
    creem_order_id: orderId || payment.creem_order_id,
  });
  return "applied";
}

/**
 * 同步 `checkout.expired`。
 */
async function syncCheckoutExpired(
  event: CreemWebhookEvent,
  payments: PaymentTable,
): Promise<CreemEventSyncStatus> {
  const object = readEventObject(event);
  const payment = await findPaymentByEventObject(payments, object);
  if (!payment) return "ignored";
  if (payment.status !== "pending") return "ignored";
  await updatePayment(payments, payment.payment_id, { status: "expired" });
  return "applied";
}

/**
 * 同步支付失败事件。
 */
async function syncCheckoutFailed(
  event: CreemWebhookEvent,
  payments: PaymentTable,
): Promise<CreemEventSyncStatus> {
  const object = readEventObject(event);
  const payment = await findPaymentByEventObject(payments, object);
  if (!payment) return "ignored";
  if (payment.status !== "pending") return "ignored";
  await updatePayment(payments, payment.payment_id, {
    status: "failed",
    creem_order_id: readObjectId(readMetadata(object.order)) || normalizeOptionalText(object.order_id),
  });
  return "applied";
}

/**
 * 根据 webhook 对象寻找支付记录。
 */
async function findPaymentByEventObject(
  payments: PaymentTable,
  object: Record<string, unknown>,
): Promise<CreemPaymentRecord | undefined> {
  const metadata = readMetadata(object.metadata);
  const paymentId = normalizeOptionalText(metadata.payment_id) || normalizeOptionalText(object.request_id);
  if (paymentId) {
    const record = (await payments.select({ payment_id: paymentId }))[0];
    if (record) return record;
  }

  const checkoutId = readObjectId(object) || normalizeOptionalText(object.checkout_id);
  if (checkoutId) {
    const record = (await payments.select({ creem_checkout_id: checkoutId }))[0];
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
): Promise<CreemPaymentRecord | undefined> {
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
    status: CreemPaymentStatus;
    creem_order_id?: string;
  },
): Promise<void> {
  await payments.update({
    where: { payment_id: paymentId },
    values: {
      status: input.status,
      creem_order_id: normalizeOptionalText(input.creem_order_id),
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
  syncStatus: CreemEventSyncStatus,
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
function toCheckoutResult(row: CreemPaymentRecord): CreemCheckoutCreateResult {
  return {
    payment_id: row.payment_id,
    topup_id: row.topup_id,
    creem_checkout_id: row.creem_checkout_id,
    checkout_url: row.checkout_url,
    status: row.status,
  };
}

/**
 * 统一排序支付记录。
 */
function sortPayments(rows: CreemPaymentRecord[]): CreemPaymentRecord[] {
  return [...rows].sort((left, right) => {
    if (left.updated_at === right.updated_at) return right.created_at.localeCompare(left.created_at);
    return right.updated_at.localeCompare(left.updated_at);
  });
}

/**
 * 统一排序 webhook 事件记录。
 */
function sortEvents(rows: CreemEventRecord[]): CreemEventRecord[] {
  return [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

/**
 * 读取 webhook 事件类型。
 */
function readEventType(event: CreemWebhookEvent): string {
  return normalizeOptionalText(event.eventType) || normalizeOptionalText(event.type) || "unknown";
}

/**
 * 读取 webhook 事件主体。
 */
function readEventObject(event: CreemWebhookEvent): Record<string, unknown> {
  const directObject = readMetadata(event.object);
  if (Object.keys(directObject).length > 0) return directObject;
  return readMetadata(event.data?.object);
}

/**
 * 读取对象 ID。
 */
function readObjectId(object: Record<string, unknown>): string {
  return normalizeOptionalText(object.id);
}

/**
 * 规范化服务配置。
 */
function normalizeOptions(options: CreemPaymentServiceOptions): NormalizedCreemPaymentServiceOptions {
  if (!options?.balance) throw new TypeError("Creem payment service requires a balance service instance");
  return {
    ...options,
    balance: options.balance,
    currency: normalizeCurrency(options.currency) || "usd",
    api_base_url: normalizeCreemApiBaseURL(options.api_base_url),
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
  options: NormalizedCreemPaymentServiceOptions,
  ctx: { env(key: string): string | undefined },
): string {
  return normalizeCurrency(ctx.env("CREEM_CURRENCY")) || options.currency || "usd";
}

/**
 * 解析当前请求最终使用的 Creem API 基础地址。
 */
function resolveApiBaseURL(
  options: NormalizedCreemPaymentServiceOptions,
  ctx: { env(key: string): string | undefined },
): string {
  return normalizeCreemApiBaseURL(ctx.env("CREEM_API_BASE_URL") || options.api_base_url);
}

/**
 * 返回最小 HTML 页面，避免 Creem 跳回后出现 404。
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
