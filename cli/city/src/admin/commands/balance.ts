/**
 * Admin Balance 管理命令。
 */

import { Gate } from "@downcity/city";
import { isCancel, select } from "@clack/prompts";
import { askText, showError, showSuccess } from "../../core/ui.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";

export async function manageBalance(a: Gate): Promise<void> {
  while (true) {
    const act = await select({
      message: "Balance",
      options: [
        { label: "List users", value: "users" },
        { label: "History", value: "history" },
        { label: "Topups", value: "topups" },
        { label: "Redeem codes", value: "redeem_codes" },
        { label: "Add balance", value: "add" },
        { label: "Subtract balance", value: "sub" },
        { label: "Finish topup", value: "finish" },
        { label: "Cancel topup", value: "cancel" },
        { label: "Create redeem code", value: "create_redeem_code" },
        { label: "Disable redeem code", value: "disable_redeem_code" },
        { label: "Back", value: "back" },
      ],
    });
    if (!act || isCancel(act) || act === "back") return;

    try {
      if (act === "users") {
        const items = await a.balance.listUsers(30);
        console.log(`\n${items.length} balance accounts:\n`);
        for (const item of items) {
          console.log(`  ${item.user_id.padEnd(28)} ${String(item.balance).padStart(8)} ${item.unit.padEnd(10)} ${item.updated_at.slice(0, 19)}`);
        }
        console.log("");
        continue;
      }

      if (act === "history") {
        const userId = await askText("user_id (optional)");
        const items = await a.balance.listHistory({
          limit: 30,
          user_id: userId ?? "",
        });
        console.log(`\n${items.length} balance history entries:\n`);
        for (const item of items) {
          console.log(`  ${item.created_at.slice(0, 19)}  ${item.user_id.padEnd(20)} ${item.kind.padEnd(8)} ${String(item.amount).padStart(6)} -> ${String(item.balance_after).padStart(6)}  ${item.note}`);
        }
        console.log("");
        continue;
      }

      if (act === "topups") {
        const userId = await askText("user_id (optional)");
        const items = await a.balance.listTopups({
          limit: 30,
          user_id: userId ?? "",
        });
        console.log(`\n${items.length} topup orders:\n`);
        for (const item of items) {
          console.log(`  ${item.topup_id.padEnd(24)} ${item.user_id.padEnd(20)} ${String(item.amount).padStart(6)} ${item.unit.padEnd(10)} [${item.status}] ${item.note}`);
        }
        console.log("");
        continue;
      }

      if (act === "redeem_codes") {
        const status = await askText("status (optional: active/redeemed/disabled)");
        const userId = await askText("redeemed_by_user_id (optional)");
        const items = await a.balance.redeemCodes.list({
          limit: 30,
          status: normalizeRedeemCodeStatus(status),
          user_id: userId ?? "",
        });
        console.log(`\n${items.length} redeem codes:\n`);
        for (const item of items) {
          const owner = item.redeemed_by_user_id || "-";
          console.log(`  ${item.redeem_code_id.padEnd(24)} ${item.code_mask.padEnd(22)} ${String(item.amount).padStart(6)} ${item.unit.padEnd(10)} [${item.status.padEnd(8)}] ${owner.padEnd(20)} ${item.note}`);
        }
        console.log("");
        continue;
      }

      if (act === "add" || act === "sub") {
        const userId = await askText("user_id");
        if (!userId) continue;
        const rawAmount = await askText("amount");
        if (!rawAmount) continue;

        const amount = Number(rawAmount);
        if (!Number.isInteger(amount) || amount <= 0) {
          showError("amount must be a positive integer");
          continue;
        }

        const note = await askText("note (optional)");
        const account = act === "add"
          ? await a.balance.add({ user_id: userId, amount, note: note ?? "" })
          : await a.balance.sub({ user_id: userId, amount, note: note ?? "" });
        showSuccess(`balance updated: ${account.user_id} -> ${account.balance} ${account.unit}`);
        continue;
      }

      if (act === "create_redeem_code") {
        const rawAmount = await askText("amount");
        if (!rawAmount) continue;

        const amount = Number(rawAmount);
        if (!Number.isInteger(amount) || amount <= 0) {
          showError("amount must be a positive integer");
          continue;
        }

        const code = await askText("custom redeem_code (optional)");
        const note = await askText("note (optional)");
        const issued = await a.balance.redeemCodes.create({
          amount,
          code: code ?? "",
          note: note ?? "",
        });
        showSuccess(`redeem_code created: ${issued.redeem_code_id} -> ${issued.code} (+${issued.amount} ${issued.unit})`);
        continue;
      }

      if (act === "disable_redeem_code") {
        const redeemCodeId = await askText("redeem_code_id");
        if (!redeemCodeId) continue;
        const note = await askText("note (optional)");
        const item = await a.balance.redeemCodes.disable({
          redeem_code_id: redeemCodeId,
          note: note ?? "",
        });
        showSuccess(`redeem_code updated: ${item.redeem_code_id} -> ${item.status}`);
        continue;
      }

      const topupId = await askText("topup_id");
      if (!topupId) continue;
      const note = await askText("note (optional)");
      const topup = act === "finish"
        ? await a.balance.finishTopup({ topup_id: topupId, note: note ?? "" })
        : await a.balance.cancelTopup({ topup_id: topupId, note: note ?? "" });
      showSuccess(`topup updated: ${topup.topup_id} -> ${topup.status}`);
    } catch (e) {
      rethrowAdminAuthError(e);
      showError(adminErrorMessage(e));
    }
  }
}

function normalizeRedeemCodeStatus(value: string | undefined): "active" | "redeemed" | "disabled" | undefined {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  if (normalized === "active" || normalized === "redeemed" || normalized === "disabled") {
    return normalized;
  }
  throw new TypeError("status must be active, redeemed, or disabled");
}
