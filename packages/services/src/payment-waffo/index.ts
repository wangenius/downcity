/**
 * Downcity Waffo Pancake 一次性充值服务。
 *
 * 关键说明（中文）
 * - 当前版本只处理 Waffo Checkout 一次性充值
 * - 不处理 subscription，也不处理 refund ticket
 * - 支付成功后统一调用 balance.finishTopup() 完成到账
 */

import type { EnvRequirement, ServiceDefinition } from "@downcity/city";
import { resolvePaymentRedirectURL } from "../payment/redirect.js";
import { waffoEvents, waffoPayments } from "./schema.js";
import {
  createWaffoCheckoutSession,
  createWaffoClient,
  normalizeOptionalText,
  normalizeRequired,
  normalizeWaffoEnvironment,
  parseWaffoWebhookEvent,
  readMetadata,
} from "./waffo.js";
import type {
  WaffoCheckoutCreateResult,
  WaffoCreateCheckoutInput,
  WaffoEventRecord,
  WaffoEventSyncStatus,
  WaffoPaymentRecord,
  WaffoPaymentServiceOptions,
  WaffoPaymentStatus,
  WaffoWebhookEvent,
} from "./types.js";

type PaymentTable = {
  select(where?: Partial<WaffoPaymentRecord>): Promise<WaffoPaymentRecord[]>;
  insert(row: WaffoPaymentRecord): Promise<unknown>;
  update(input: {
    where: Partial<WaffoPaymentRecord>;
    values: Partial<WaffoPaymentRecord>;
  }): Promise<unknown>;
};

type EventTable = {
  select(where?: Partial<WaffoEventRecord>): Promise<WaffoEventRecord[]>;
  insert(row: WaffoEventRecord): Promise<unknown>;
  update(input: {
    where: Partial<WaffoEventRecord>;
    values: Partial<WaffoEventRecord>;
  }): Promise<unknown>;
};

interface NormalizedWaffoPaymentServiceOptions {
  balance: WaffoPaymentServiceOptions["balance"];
  merchant_id?: string;
  private_key?: string;
  product_id?: string;
  webhook_public_key?: string;
  environment: "test" | "prod";
  currency: string;
  api_base_url?: string;
}

/**
 * Waffo 服务对外暴露的运行时环境变量。
 */
const waffoPaymentEnv: EnvRequirement[] = [
  {
    key: "WAFFO_MERCHANT_ID",
    description: "Waffo Merchant ID，例如 MER_xxx",
    required: true,
  },
  {
    key: "WAFFO_PRIVATE_KEY",
    description: "Waffo API private key，用于 SDK 请求签名",
    required: true,
  },
  {
    key: "WAFFO_PRODUCT_ID",
    description: "Waffo product_id，用于创建 Checkout Session",
    required: true,
  },
  {
    key: "WAFFO_WEBHOOK_PUBLIC_KEY",
    description: "Waffo webhook public key，用于校验 x-waffo-signature",
    required: false,
  },
  {
    key: "WAFFO_ENVIRONMENT",
    description: "Waffo 环境：test 或 prod；默认 test",
    required: false,
  },
  {
    key: "DOWNCITY_CITY_BASE_URL",
    description: "City 对外访问地址；用于自动生成 Waffo 默认跳转页地址",
    required: false,
  },
  {
    key: "WAFFO_CURRENCY",
    description: "默认结算币种，例如 usd",
    required: false,
  },
  {
    key: "WAFFO_API_BASE_URL",
    description: "可选的 Waffo API 基础地址覆写，通常只用于测试环境",
    required: false,
  },
];

export { waffoEvents, waffoPayments } from "./schema.js";
export type {
  WaffoCheckoutCreateResult,
  WaffoCreateCheckoutInput,
  WaffoEventRecord,
  WaffoEventSyncStatus,
  WaffoPaymentEnvironment,
  WaffoPaymentRecord,
  WaffoPaymentServiceBalanceBridge,
  WaffoPaymentServiceOptions,
  WaffoPaymentStatus,
  WaffoPaymentTopupRecord,
  WaffoWebhookEvent,
  WaffoWebhookEventData,
} from "./types.js";

/**
 * 创建 Waffo Pancake 一次性充值服务。
 */
export function waffoPaymentService(options: WaffoPaymentServiceOptions): ServiceDefinition {
  const normalized = normalizeOptions(options);

  return {
    id: "payment.waffo",
    name: "Waffo Pancake Payment",
    version: "0.1.0",
    env: waffoPaymentEnv,
    schema: {
      payments: waffoPayments,
      events: waffoEvents,
    },
    instruction: [
      "使用 Waffo Pancake 创建一次性充值 Checkout，并在 webhook 成功后完成 balance topup。",
      "这个服务不处理 subscription，也不处理 refund ticket。",
      "当 options 未显式传入时，会回退读取 WAFFO_MERCHANT_ID / WAFFO_PRIVATE_KEY / WAFFO_PRODUCT_ID。",
      `currency=${normalized.currency}，environment=${normalized.environment}。`,
      "支付成功后统一通过 balance.finishTopup() 完成到账。",
    ].join("\n"),
    install(ctx) {
      const payments = ctx.table<WaffoPaymentRecord>("payments") as PaymentTable;
      const events = ctx.table<WaffoEventRecord>("events") as EventTable;
      const balance = normalized.balance;

      ctx.route({
        method: "POST",
        path: "/checkout/create",
        auth: ["user"],
        async handler(requestCtx) {
          const body = await requestCtx.json<WaffoCreateCheckoutInput>();
          const userId = normalizeRequired(requestCtx.user?.user_id, "user_id");
          const topup = await balance.readTopup(normalizeRequired(body.topup_id, "topup_id"));
          if (topup.user_id !== userId) {
            return requestCtx.jsonResponse({ error: "Topup does not belong to current user" }, 403);
          }
          if (topup.status !== "pending") {
            return requestCtx.jsonResponse({ error: `Topup is already ${topup.status}` }, 409);
          }

          const existing = await findActivePaymentByTopup(payments, topup.topup_id);
          if (existing) return requestCtx.jsonResponse(toCheckoutResult(existing));

          const merchantId = normalized.merchant_id ?? ctx.env("WAFFO_MERCHANT_ID");
          if (!merchantId) return requestCtx.jsonResponse({ error: "Waffo merchant id is not configured" }, 500);

          const privateKey = normalized.private_key ?? ctx.env("WAFFO_PRIVATE_KEY");
          if (!privateKey) return requestCtx.jsonResponse({ error: "Waffo private key is not configured" }, 500);

          const productId = normalized.product_id ?? ctx.env("WAFFO_PRODUCT_ID");
          if (!productId) return requestCtx.jsonResponse({ error: "Waffo product id is not configured" }, 500);

          const paymentId = `pay_${randomId()}`;
          const currency = resolveCurrency(normalized, ctx);
          const client = createWaffoClient({
            merchant_id: merchantId,
            private_key: privateKey,
            webhook_public_key: normalized.webhook_public_key ?? ctx.env("WAFFO_WEBHOOK_PUBLIC_KEY"),
            api_base_url: normalized.api_base_url ?? ctx.env("WAFFO_API_BASE_URL"),
          });
          const created = await createWaffoCheckoutSession(client, {
            payment_id: paymentId,
            topup,
            product_id: productId,
            currency,
            success_url: resolvePaymentRedirectURL({
              path: "/v1/payment.waffo/redirect/success",
              ctx,
              request: requestCtx.request,
            }),
          });
          const now = new Date().toISOString();
          const row: WaffoPaymentRecord = {
            payment_id: paymentId,
            topup_id: topup.topup_id,
            user_id: topup.user_id,
            waffo_session_id: created.session_id,
            waffo_order_id: "",
            waffo_payment_id: "",
            amount: topup.amount,
            currency,
            status: "pending",
            checkout_url: created.checkout_url,
            metadata_json: JSON.stringify({
              unit: topup.unit,
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
          let event: WaffoWebhookEvent;
          try {
            const client = createWaffoClient({
              merchant_id: normalized.merchant_id ?? ctx.env("WAFFO_MERCHANT_ID") ?? "MER_webhook",
              private_key: normalized.private_key ?? ctx.env("WAFFO_PRIVATE_KEY") ?? fallbackPrivateKey(),
              webhook_public_key: normalized.webhook_public_key ?? ctx.env("WAFFO_WEBHOOK_PUBLIC_KEY"),
              api_base_url: normalized.api_base_url ?? ctx.env("WAFFO_API_BASE_URL"),
            });
            event = parseWaffoWebhookEvent({
              client,
              raw,
              signature: requestCtx.request.headers.get("x-waffo-signature"),
              environment: resolveEnvironment(normalized, ctx),
            });
          } catch {
            return requestCtx.jsonResponse({ error: "Invalid Waffo signature" }, 400);
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

          const eventRow: WaffoEventRecord = {
            event_id: eventId,
            type: eventType,
            payload_json: JSON.stringify(event),
            sync_status: "pending",
            sync_error: "",
            created_at: new Date().toISOString(),
          };
          await events.insert(eventRow);

          try {
            const syncStatus = await syncWaffoEvent({ event, payments, balance });
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
            description: "Your Waffo Pancake payment has been accepted. If the balance view has not refreshed yet, close this page and return to your app.",
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
 * 统一同步 Waffo webhook 事件。
 */
async function syncWaffoEvent(input: {
  event: WaffoWebhookEvent;
  payments: PaymentTable;
  balance: WaffoPaymentServiceOptions["balance"];
}): Promise<WaffoEventSyncStatus> {
  const { event, payments, balance } = input;
  switch (readEventType(event)) {
    case "order.completed":
      return await syncOrderCompleted(event, payments, balance);
    case "subscription.past_due":
    case "refund.failed":
      return "ignored";
    default:
      return "ignored";
  }
}

/**
 * 同步 `order.completed`。
 */
async function syncOrderCompleted(
  event: WaffoWebhookEvent,
  payments: PaymentTable,
  balance: WaffoPaymentServiceOptions["balance"],
): Promise<WaffoEventSyncStatus> {
  const data = readEventData(event);
  const payment = await findPaymentByEventData(payments, data);
  if (!payment) return "ignored";
  if (payment.status === "paid") return "applied";

  const orderId = normalizeOptionalText(data.orderId);
  const waffoPaymentId = normalizeOptionalText(data.paymentId) || normalizeOptionalText(event.eventId);
  const topup = await balance.readTopup(payment.topup_id);
  if (topup.status === "pending") {
    await balance.finishTopup(payment.topup_id, {
      note: "waffo topup",
      ref: waffoPaymentId || orderId || payment.waffo_session_id,
      meta: {
        waffo_event_id: readEventId(event),
        waffo_order_id: orderId,
        waffo_payment_id: waffoPaymentId,
        waffo_service_payment_id: payment.payment_id,
      },
    });
  }

  await updatePayment(payments, payment.payment_id, {
    status: "paid",
    waffo_order_id: orderId || payment.waffo_order_id,
    waffo_payment_id: waffoPaymentId || payment.waffo_payment_id,
  });
  return "applied";
}

/**
 * 根据 webhook data 寻找支付记录。
 */
async function findPaymentByEventData(
  payments: PaymentTable,
  data: Record<string, unknown>,
): Promise<WaffoPaymentRecord | undefined> {
  const paymentId = normalizeOptionalText(data.orderMerchantExternalId);
  if (paymentId) {
    const record = (await payments.select({ payment_id: paymentId }))[0];
    if (record) return record;
  }

  const orderId = normalizeOptionalText(data.orderId);
  if (orderId) {
    const record = (await payments.select({ waffo_order_id: orderId }))[0];
    if (record) return record;
  }

  const waffoPaymentId = normalizeOptionalText(data.paymentId);
  if (waffoPaymentId) {
    const record = (await payments.select({ waffo_payment_id: waffoPaymentId }))[0];
    if (record) return record;
  }

  const metadata = readMetadata(data.orderMetadata);
  const topupId = normalizeOptionalText(metadata.topup_id);
  if (topupId) return await findActivePaymentByTopup(payments, topupId);

  return undefined;
}

/**
 * 查询某个 topup 当前的活跃支付记录。
 */
async function findActivePaymentByTopup(
  payments: PaymentTable,
  topupId: string,
): Promise<WaffoPaymentRecord | undefined> {
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
    status: WaffoPaymentStatus;
    waffo_order_id?: string;
    waffo_payment_id?: string;
  },
): Promise<void> {
  await payments.update({
    where: { payment_id: paymentId },
    values: {
      status: input.status,
      waffo_order_id: normalizeOptionalText(input.waffo_order_id),
      waffo_payment_id: normalizeOptionalText(input.waffo_payment_id),
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
  syncStatus: WaffoEventSyncStatus,
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
function toCheckoutResult(row: WaffoPaymentRecord): WaffoCheckoutCreateResult {
  return {
    payment_id: row.payment_id,
    topup_id: row.topup_id,
    waffo_session_id: row.waffo_session_id,
    checkout_url: row.checkout_url,
    status: row.status,
  };
}

/**
 * 统一排序支付记录。
 */
function sortPayments(rows: WaffoPaymentRecord[]): WaffoPaymentRecord[] {
  return [...rows].sort((left, right) => {
    if (left.updated_at === right.updated_at) return right.created_at.localeCompare(left.created_at);
    return right.updated_at.localeCompare(left.updated_at);
  });
}

/**
 * 统一排序 webhook 事件记录。
 */
function sortEvents(rows: WaffoEventRecord[]): WaffoEventRecord[] {
  return [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

/**
 * 读取 webhook 事件 ID。
 */
function readEventId(event: WaffoWebhookEvent): string {
  return normalizeRequired(event.id || event.eventId || `evt_${randomId()}`, "waffo event id");
}

/**
 * 读取 webhook 事件类型。
 */
function readEventType(event: WaffoWebhookEvent): string {
  return normalizeOptionalText(event.eventType) || "unknown";
}

/**
 * 读取 webhook data。
 */
function readEventData(event: WaffoWebhookEvent): Record<string, unknown> {
  return readMetadata(event.data);
}

/**
 * 规范化服务配置。
 */
function normalizeOptions(options: WaffoPaymentServiceOptions): NormalizedWaffoPaymentServiceOptions {
  if (!options?.balance) throw new TypeError("Waffo payment service requires a balance service instance");
  return {
    ...options,
    balance: options.balance,
    environment: normalizeWaffoEnvironment(options.environment),
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
  options: NormalizedWaffoPaymentServiceOptions,
  ctx: { env(key: string): string | undefined },
): string {
  return normalizeCurrency(ctx.env("WAFFO_CURRENCY")) || options.currency || "usd";
}

/**
 * 解析当前请求最终使用的 Waffo 环境。
 */
function resolveEnvironment(
  options: NormalizedWaffoPaymentServiceOptions,
  ctx: { env(key: string): string | undefined },
): "test" | "prod" {
  return normalizeWaffoEnvironment(ctx.env("WAFFO_ENVIRONMENT") || options.environment);
}

/**
 * 返回最小 HTML 页面，避免 Waffo 跳回后出现 404。
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
 * webhook-only client 兜底私钥。
 *
 * 关键说明（中文）
 * - Waffo SDK 构造函数要求 privateKey
 * - webhook 验签只需要 public key，这里只在未配置私钥且仅处理 webhook 时兜底
 */
function fallbackPrivateKey(): string {
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

/**
 * 生成短随机 ID。
 */
function randomId(): string {
  return crypto.randomUUID?.().replaceAll("-", "").slice(0, 16) || Math.random().toString(36).slice(2, 18);
}
