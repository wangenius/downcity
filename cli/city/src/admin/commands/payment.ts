/**
 * Admin Payment 管理命令。
 */

import { City } from "@downcity/city";
import { buildStripeEndpoints } from "../../core/stripe.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
import type { admin_tui_runtime } from "../../types/AdminTui.js";

interface StripePaymentListItem {
  /** 支付记录 ID */
  payment_id: string;
  /** 充值单 ID */
  topup_id: string;
  /** 用户 ID */
  user_id: string;
  /** 充值金额 */
  amount: number;
  /** 结算币种 */
  currency: string;
  /** 当前状态 */
  status: string;
  /** 更新时间 */
  updated_at: string;
}

interface StripeEventListItem {
  /** 事件 ID */
  event_id: string;
  /** 事件类型 */
  type: string;
  /** 同步状态 */
  sync_status: string;
  /** 同步错误 */
  sync_error: string;
  /** 创建时间 */
  created_at: string;
}

export async function managePayment(a: City, baseUrl: string, runtime: admin_tui_runtime): Promise<void> {
  const svc = a.service("payment.stripe");
  const endpoints = buildStripeEndpoints(baseUrl);
  while (true) {
    const act = await runtime.select("Payment", [
        { label: "Show webhook setup", value: "webhook", hint: endpoints.webhook_url },
        { label: "List payments", value: "payments" },
        { label: "List webhook events", value: "events" },
        { label: "Back", value: "back" },
      ]);
    if (!act || act === "back") return;

    try {
      if (act === "webhook") {
        await runtime.show_text("Stripe Webhook Setup", [
          `Server URL: ${endpoints.base_url}`,
          `Stripe webhook endpoint: ${endpoints.webhook_url}`,
          "Recommended Stripe events:",
          "- checkout.session.completed",
          "- checkout.session.expired",
          "- payment_intent.payment_failed",
          "After creating the endpoint in Stripe Dashboard, copy its Signing secret into STRIPE_WEBHOOK_SECRET.",
        ].join("\n"));
        continue;
      }

      if (act === "payments") {
        const result = await runtime.with_loading("Payments", async () => await svc.get<{ items: StripePaymentListItem[] }>("payments"));
        await runtime.show_table({
          title: `${result.items.length} Payments`,
          columns: ["Updated", "User", "Amount", "Currency", "Status", "Payment ID"],
          rows: result.items.map((item) => ({
            cells: [item.updated_at.slice(0, 19), item.user_id, String(item.amount), item.currency, item.status, item.payment_id],
          })),
          empty_message: "No payments.",
        });
        continue;
      }

      const result = await runtime.with_loading("Webhook Events", async () => await svc.get<{ items: StripeEventListItem[] }>("events"));
      await runtime.show_table({
        title: `${result.items.length} Webhook Events`,
        columns: ["Created", "Type", "Status", "Event ID", "Error"],
        rows: result.items.map((item) => ({
          cells: [item.created_at.slice(0, 19), item.type, item.sync_status, item.event_id, item.sync_error || ""],
        })),
        empty_message: "No webhook events.",
      });
    } catch (e) {
      rethrowAdminAuthError(e);
      await runtime.show_message("error", adminErrorMessage(e));
    }
  }
}
