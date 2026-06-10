/**
 * Admin Balance 管理命令。
 */
import { t } from "../../i18n.js";
import { adminErrorMessage, rethrowAdminAuthError } from "../auth-error.js";
export async function manageBalance(a, _baseUrl, runtime) {
    while (true) {
        const act = await runtime.select("Balance", [
            { label: t({ zh: "查看用户", en: "List users" }), value: "users" },
            { label: t({ zh: "余额历史", en: "History" }), value: "history" },
            { label: t({ zh: "充值单", en: "Topups" }), value: "topups" },
            { label: t({ zh: "兑换码", en: "Redeem codes" }), value: "redeem_codes" },
            { label: t({ zh: "增加余额", en: "Add balance" }), value: "add" },
            { label: t({ zh: "扣减余额", en: "Subtract balance" }), value: "sub" },
            { label: t({ zh: "完成充值单", en: "Finish topup" }), value: "finish" },
            { label: t({ zh: "取消充值单", en: "Cancel topup" }), value: "cancel" },
            { label: t({ zh: "创建兑换码", en: "Create redeem code" }), value: "create_redeem_code" },
            { label: t({ zh: "停用兑换码", en: "Disable redeem code" }), value: "disable_redeem_code" },
            { label: t({ zh: "返回", en: "Back" }), value: "back" },
        ]);
        if (!act || act === "back")
            return;
        try {
            if (act === "users") {
                const items = await runtime.with_loading(t({ zh: "余额账户", en: "Balance Accounts" }), async () => await a.balance.listUsers(30));
                await runtime.show_table({
                    title: t({ zh: `${items.length} 个余额账户`, en: `${items.length} Balance Accounts` }),
                    columns: [t({ zh: "用户", en: "User" }), t({ zh: "余额", en: "Balance" }), t({ zh: "单位", en: "Unit" }), t({ zh: "更新时间", en: "Updated" })],
                    rows: items.map((item) => ({
                        cells: [item.user_id, String(item.balance), item.unit, item.updated_at.slice(0, 19)],
                    })),
                    empty_message: t({ zh: "暂无余额账户。", en: "No balance accounts." }),
                });
                continue;
            }
            if (act === "history") {
                const userId = await runtime.text(t({ zh: "user_id（可选）", en: "user_id (optional)" }));
                const items = await runtime.with_loading(t({ zh: "余额历史", en: "Balance History" }), async () => await a.balance.listHistory({
                    limit: 30,
                    user_id: userId ?? "",
                }));
                await runtime.show_table({
                    title: t({ zh: `${items.length} 条余额历史`, en: `${items.length} Balance History` }),
                    columns: [t({ zh: "创建时间", en: "Created" }), t({ zh: "用户", en: "User" }), t({ zh: "类型", en: "Kind" }), t({ zh: "金额", en: "Amount" }), t({ zh: "变更后余额", en: "Balance After" }), t({ zh: "备注", en: "Note" })],
                    rows: items.map((item) => ({
                        cells: [item.created_at.slice(0, 19), item.user_id, item.kind, String(item.amount), String(item.balance_after), item.note],
                    })),
                    empty_message: t({ zh: "暂无余额历史。", en: "No balance history." }),
                });
                continue;
            }
            if (act === "topups") {
                const userId = await runtime.text(t({ zh: "user_id（可选）", en: "user_id (optional)" }));
                const items = await runtime.with_loading("Topups", async () => await a.balance.listTopups({
                    limit: 30,
                    user_id: userId ?? "",
                }));
                await runtime.show_table({
                    title: t({ zh: `${items.length} 个充值单`, en: `${items.length} Topups` }),
                    columns: ["Topup ID", t({ zh: "用户", en: "User" }), t({ zh: "金额", en: "Amount" }), t({ zh: "单位", en: "Unit" }), t({ zh: "状态", en: "Status" }), t({ zh: "备注", en: "Note" })],
                    rows: items.map((item) => ({
                        cells: [item.topup_id, item.user_id, String(item.amount), item.unit, item.status, item.note],
                    })),
                    empty_message: t({ zh: "暂无充值单。", en: "No topups." }),
                });
                continue;
            }
            if (act === "redeem_codes") {
                const status = await runtime.text(t({ zh: "status（可选：active/redeemed/disabled）", en: "status (optional: active/redeemed/disabled)" }));
                const userId = await runtime.text(t({ zh: "redeemed_by_user_id（可选）", en: "redeemed_by_user_id (optional)" }));
                const items = await runtime.with_loading(t({ zh: "兑换码", en: "Redeem Codes" }), async () => await a.balance.redeemCodes.list({
                    limit: 30,
                    status: normalizeRedeemCodeStatus(status),
                    user_id: userId ?? "",
                }));
                await runtime.show_table({
                    title: t({ zh: `${items.length} 个兑换码`, en: `${items.length} Redeem Codes` }),
                    columns: ["Redeem Code ID", t({ zh: "Code", en: "Code" }), t({ zh: "金额", en: "Amount" }), t({ zh: "单位", en: "Unit" }), t({ zh: "状态", en: "Status" }), t({ zh: "归属用户", en: "Owner" }), t({ zh: "备注", en: "Note" })],
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
                    empty_message: t({ zh: "暂无兑换码。", en: "No redeem codes." }),
                });
                continue;
            }
            if (act === "add" || act === "sub") {
                const userId = await runtime.text("user_id");
                if (!userId)
                    continue;
                const rawAmount = await runtime.text(t({ zh: "金额", en: "amount" }));
                if (!rawAmount)
                    continue;
                const amount = Number(rawAmount);
                if (!Number.isInteger(amount) || amount <= 0) {
                    await runtime.show_message("error", t({ zh: "amount 必须是正整数", en: "amount must be a positive integer" }));
                    continue;
                }
                const note = await runtime.text(t({ zh: "备注（可选）", en: "note (optional)" }));
                const account = await runtime.with_loading(t({ zh: "更新余额", en: "Update Balance" }), async () => act === "add"
                    ? await a.balance.add({ user_id: userId, amount, note: note ?? "" })
                    : await a.balance.sub({ user_id: userId, amount, note: note ?? "" }));
                await runtime.show_message("success", t({
                    zh: `余额已更新：${account.user_id} -> ${account.balance} ${account.unit}`,
                    en: `balance updated: ${account.user_id} -> ${account.balance} ${account.unit}`,
                }));
                continue;
            }
            if (act === "create_redeem_code") {
                const rawAmount = await runtime.text(t({ zh: "金额", en: "amount" }));
                if (!rawAmount)
                    continue;
                const amount = Number(rawAmount);
                if (!Number.isInteger(amount) || amount <= 0) {
                    await runtime.show_message("error", t({ zh: "amount 必须是正整数", en: "amount must be a positive integer" }));
                    continue;
                }
                const code = await runtime.text(t({ zh: "自定义 redeem_code（可选）", en: "custom redeem_code (optional)" }));
                const note = await runtime.text(t({ zh: "备注（可选）", en: "note (optional)" }));
                const issued = await runtime.with_loading(t({ zh: "创建兑换码", en: "Create Redeem Code" }), async () => await a.balance.redeemCodes.create({
                    amount,
                    code: code ?? "",
                    note: note ?? "",
                }));
                await runtime.show_text(t({ zh: "兑换码已创建", en: "Redeem Code Created" }), t({
                    zh: `redeem_code 已创建：${issued.redeem_code_id}\ncode: ${issued.code}\namount: +${issued.amount} ${issued.unit}`,
                    en: `redeem_code created: ${issued.redeem_code_id}\ncode: ${issued.code}\namount: +${issued.amount} ${issued.unit}`,
                }));
                continue;
            }
            if (act === "disable_redeem_code") {
                const redeemCodeId = await runtime.text("redeem_code_id");
                if (!redeemCodeId)
                    continue;
                const note = await runtime.text(t({ zh: "备注（可选）", en: "note (optional)" }));
                const item = await runtime.with_loading(t({ zh: "停用兑换码", en: "Disable Redeem Code" }), async () => await a.balance.redeemCodes.disable({
                    redeem_code_id: redeemCodeId,
                    note: note ?? "",
                }));
                await runtime.show_message("success", t({
                    zh: `redeem_code 已更新：${item.redeem_code_id} -> ${item.status}`,
                    en: `redeem_code updated: ${item.redeem_code_id} -> ${item.status}`,
                }));
                continue;
            }
            const topupId = await runtime.text("topup_id");
            if (!topupId)
                continue;
            const note = await runtime.text(t({ zh: "备注（可选）", en: "note (optional)" }));
            const topup = await runtime.with_loading(t({ zh: "更新充值单", en: "Update Topup" }), async () => act === "finish"
                ? await a.balance.finishTopup({ topup_id: topupId, note: note ?? "" })
                : await a.balance.cancelTopup({ topup_id: topupId, note: note ?? "" }));
            await runtime.show_message("success", t({
                zh: `充值单已更新：${topup.topup_id} -> ${topup.status}`,
                en: `topup updated: ${topup.topup_id} -> ${topup.status}`,
            }));
        }
        catch (e) {
            rethrowAdminAuthError(e);
            await runtime.show_message("error", adminErrorMessage(e));
        }
    }
}
function normalizeRedeemCodeStatus(value) {
    const normalized = String(value ?? "").trim();
    if (!normalized)
        return undefined;
    if (normalized === "active" || normalized === "redeemed" || normalized === "disabled") {
        return normalized;
    }
    throw new TypeError(t({
        zh: "status 必须是 active、redeemed 或 disabled",
        en: "status must be active, redeemed, or disabled",
    }));
}
//# sourceMappingURL=balance.js.map