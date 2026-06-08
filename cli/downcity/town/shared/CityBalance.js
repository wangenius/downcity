/**
 * Town City user 余额与充值流程。
 *
 * 关键点（中文）
 * - 只面向当前 Town 已登录的 City user，不提供 admin 加款入口。
 * - 充值链路复用 City 的 balance topup 与 payment checkout 服务。
 * - 交互菜单只调用这里的高层函数，避免 CityConnection 模块继续膨胀。
 */
import { spawnSync } from "node:child_process";
import { emitCliBlock } from "./CliReporter.js";
import { CityUserManager } from "./CityUserManager.js";
const DEFAULT_PAYMENT_METHOD_ID = "stripe";
const cityUserManager = new CityUserManager();
/**
 * 读取当前 Town City user 的余额。
 */
export async function readCurrentTownCityBalance() {
    const { user, client } = await cityUserManager.createUserClient();
    const account = await client.service("balance").get("me");
    assertBalanceUserMatchesToken(account, user.user_id);
    return account;
}
/**
 * 给当前 Town City user 发起充值。
 */
export async function rechargeCurrentTownCityUser(input) {
    const { client } = await cityUserManager.createUserClient();
    const amount = normalizePositiveInteger(input.amount, "amount");
    const method_id = normalizeText(input.method_id) || DEFAULT_PAYMENT_METHOD_ID;
    const topup = await client.service("balance").action("topups/create").invoke({
        amount,
        note: normalizeText(input.note) || "Town user recharge",
        ref: normalizeText(input.ref),
        meta: {
            source: "town-cli",
            method_id,
        },
    });
    const checkout = await client.payment.method(method_id).invoke({
        topup_id: topup.topup_id,
    });
    const checkout_url = normalizeText(checkout.checkout_url);
    const should_open = input.open_checkout !== false;
    const opened = should_open && checkout_url ? openBrowser(checkout_url) : false;
    return {
        topup,
        checkout,
        method_id,
        opened,
    };
}
function assertBalanceUserMatchesToken(account, token_user_id) {
    if (!token_user_id) {
        throw new Error("City user token resolved without a user_id. Run `town city login` again.");
    }
    if (account.user_id !== token_user_id) {
        throw new Error([
            "Balance account user does not match the authenticated token.",
            `balance=${account.user_id}`,
            `token=${token_user_id}`,
            "Run `town city logout` and then `town city login`.",
        ].join(" "));
    }
}
/**
 * 输出当前 user 余额。
 */
export async function emitCurrentTownCityBalance() {
    const account = await readCurrentTownCityBalance();
    emitCliBlock({
        tone: "success",
        title: "User balance",
        summary: `${account.balance} ${account.unit}`,
        facts: [
            { label: "user", value: account.user_id },
            { label: "balance", value: String(account.balance) },
            { label: "unit", value: account.unit },
            { label: "updated", value: account.updated_at },
        ],
    });
}
/**
 * 输出当前 user 充值结果。
 */
export function emitTownCityRechargeResult(result) {
    const checkout_url = normalizeText(result.checkout.checkout_url);
    emitCliBlock({
        tone: checkout_url ? "success" : "warning",
        title: "User recharge",
        summary: result.topup.status,
        facts: [
            { label: "amount", value: `${result.topup.amount} ${result.topup.unit}` },
            { label: "topup", value: result.topup.topup_id },
            { label: "method", value: result.method_id },
            ...(result.checkout.payment_id
                ? [{ label: "payment", value: String(result.checkout.payment_id) }]
                : []),
            ...(checkout_url ? [{ label: "checkout", value: checkout_url }] : []),
            { label: "browser", value: result.opened ? "opened" : "not opened" },
        ],
        note: checkout_url
            ? "Complete the checkout page to finish the recharge."
            : "Checkout URL was not returned by the payment service.",
    });
}
function normalizePositiveInteger(value, label) {
    const amount = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new TypeError(`${label} must be a positive integer`);
    }
    return amount;
}
function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function openBrowser(url) {
    const command = process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
            ? "cmd"
            : "xdg-open";
    const args = process.platform === "win32"
        ? ["/c", "start", "", url]
        : [url];
    try {
        const result = spawnSync(command, args, {
            stdio: "ignore",
        });
        return result.status === 0;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=CityBalance.js.map