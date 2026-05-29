/**
 * Admin Payment 管理命令。
 */

import { AdminClient } from "@downcity/gate";
import { select, isCancel } from "@clack/prompts";
import { buildStripeEndpoints } from "../../core/stripe.js";
import { show, showError } from "../../core/ui.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";

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

export async function managePayment(a: AdminClient, baseUrl: string): Promise<void> {
  const svc = a.service("payment.stripe");
  const endpoints = buildStripeEndpoints(baseUrl);
  while (true) {
    const act = await select({
      message: "Payment",
      options: [
        { label: "Show webhook setup", value: "webhook", hint: endpoints.webhook_url },
        { label: "List payments", value: "payments" },
        { label: "List webhook events", value: "events" },
        { label: "Back", value: "back" },
      ],
    });
    if (!act || isCancel(act) || act === "back") return;

    try {
      if (act === "webhook") {
        show([
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
        const result = await svc.get<{ items: StripePaymentListItem[] }>("payments");
        console.log(`\n${result.items.length} payments:\n`);
        for (const item of result.items) {
          console.log(
            `  ${item.updated_at.slice(0, 19)}  ${item.user_id.padEnd(20)} ${String(item.amount).padStart(6)} ${item.currency.padEnd(6)} [${item.status}] ${item.payment_id}`,
          );
        }
        console.log("");
        continue;
      }

      const result = await svc.get<{ items: StripeEventListItem[] }>("events");
      console.log(`\n${result.items.length} webhook events:\n`);
      for (const item of result.items) {
        const error = item.sync_error ? ` ${item.sync_error}` : "";
        console.log(`  ${item.created_at.slice(0, 19)}  ${item.type.padEnd(32)} [${item.sync_status}] ${item.event_id}${error}`);
      }
      console.log("");
    } catch (e) {
      rethrowAdminAuthError(e);
      showError(adminErrorMessage(e));
    }
  }
}
