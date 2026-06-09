/**
 * Admin Balance 管理命令。
 */

import { City } from "@downcity/city";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
import type { admin_tui_runtime } from "../../types/AdminTui.js";

export async function manageBalance(a: City, _baseUrl: string, runtime: admin_tui_runtime): Promise<void> {
  while (true) {
    const act = await runtime.select("Balance", [
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
      ]);
    if (!act || act === "back") return;

    try {
      if (act === "users") {
        const items = await runtime.with_loading("Balance Accounts", async () => await a.balance.listUsers(30));
        await runtime.show_table({
          title: `${items.length} Balance Accounts`,
          columns: ["User", "Balance", "Unit", "Updated"],
          rows: items.map((item) => ({
            cells: [item.user_id, String(item.balance), item.unit, item.updated_at.slice(0, 19)],
          })),
          empty_message: "No balance accounts.",
        });
        continue;
      }

      if (act === "history") {
        const userId = await runtime.text("user_id (optional)");
        const items = await runtime.with_loading("Balance History", async () => await a.balance.listHistory({
          limit: 30,
          user_id: userId ?? "",
        }));
        await runtime.show_table({
          title: `${items.length} Balance History`,
          columns: ["Created", "User", "Kind", "Amount", "Balance After", "Note"],
          rows: items.map((item) => ({
            cells: [item.created_at.slice(0, 19), item.user_id, item.kind, String(item.amount), String(item.balance_after), item.note],
          })),
          empty_message: "No balance history.",
        });
        continue;
      }

      if (act === "topups") {
        const userId = await runtime.text("user_id (optional)");
        const items = await runtime.with_loading("Topups", async () => await a.balance.listTopups({
          limit: 30,
          user_id: userId ?? "",
        }));
        await runtime.show_table({
          title: `${items.length} Topups`,
          columns: ["Topup ID", "User", "Amount", "Unit", "Status", "Note"],
          rows: items.map((item) => ({
            cells: [item.topup_id, item.user_id, String(item.amount), item.unit, item.status, item.note],
          })),
          empty_message: "No topups.",
        });
        continue;
      }

      if (act === "redeem_codes") {
        const status = await runtime.text("status (optional: active/redeemed/disabled)");
        const userId = await runtime.text("redeemed_by_user_id (optional)");
        const items = await runtime.with_loading("Redeem Codes", async () => await a.balance.redeemCodes.list({
          limit: 30,
          status: normalizeRedeemCodeStatus(status),
          user_id: userId ?? "",
        }));
        await runtime.show_table({
          title: `${items.length} Redeem Codes`,
          columns: ["Redeem Code ID", "Code", "Amount", "Unit", "Status", "Owner", "Note"],
          rows: items.map((item) => ({
            cells: [
              item.redeem_code_id,
              item.code_mask,
              String(item.amount),
              item.unit,
              item.status,
              item.redeemed_by_user_id || "-",
              item.note,
            ],
          })),
          empty_message: "No redeem codes.",
        });
        continue;
      }

      if (act === "add" || act === "sub") {
        const userId = await runtime.text("user_id");
        if (!userId) continue;
        const rawAmount = await runtime.text("amount");
        if (!rawAmount) continue;

        const amount = Number(rawAmount);
        if (!Number.isInteger(amount) || amount <= 0) {
          await runtime.show_message("error", "amount must be a positive integer");
          continue;
        }

        const note = await runtime.text("note (optional)");
        const account = await runtime.with_loading("Update Balance", async () => act === "add"
          ? await a.balance.add({ user_id: userId, amount, note: note ?? "" })
          : await a.balance.sub({ user_id: userId, amount, note: note ?? "" }));
        await runtime.show_message("success", `balance updated: ${account.user_id} -> ${account.balance} ${account.unit}`);
        continue;
      }

      if (act === "create_redeem_code") {
        const rawAmount = await runtime.text("amount");
        if (!rawAmount) continue;

        const amount = Number(rawAmount);
        if (!Number.isInteger(amount) || amount <= 0) {
          await runtime.show_message("error", "amount must be a positive integer");
          continue;
        }

        const code = await runtime.text("custom redeem_code (optional)");
        const note = await runtime.text("note (optional)");
        const issued = await runtime.with_loading("Create Redeem Code", async () => await a.balance.redeemCodes.create({
          amount,
          code: code ?? "",
          note: note ?? "",
        }));
        await runtime.show_text("Redeem Code Created", `redeem_code created: ${issued.redeem_code_id}\ncode: ${issued.code}\namount: +${issued.amount} ${issued.unit}`);
        continue;
      }

      if (act === "disable_redeem_code") {
        const redeemCodeId = await runtime.text("redeem_code_id");
        if (!redeemCodeId) continue;
        const note = await runtime.text("note (optional)");
        const item = await runtime.with_loading("Disable Redeem Code", async () => await a.balance.redeemCodes.disable({
          redeem_code_id: redeemCodeId,
          note: note ?? "",
        }));
        await runtime.show_message("success", `redeem_code updated: ${item.redeem_code_id} -> ${item.status}`);
        continue;
      }

      const topupId = await runtime.text("topup_id");
      if (!topupId) continue;
      const note = await runtime.text("note (optional)");
      const topup = await runtime.with_loading("Update Topup", async () => act === "finish"
        ? await a.balance.finishTopup({ topup_id: topupId, note: note ?? "" })
        : await a.balance.cancelTopup({ topup_id: topupId, note: note ?? "" }));
      await runtime.show_message("success", `topup updated: ${topup.topup_id} -> ${topup.status}`);
    } catch (e) {
      rethrowAdminAuthError(e);
      await runtime.show_message("error", adminErrorMessage(e));
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
