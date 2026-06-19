/**
 * City City user 余额与充值流程。
 *
 * 关键点（中文）
 * - 只面向当前 City 已登录的 City user，不提供 admin 加款入口。
 * - 充值链路复用 City 的 balance topup 与 payment checkout 服务。
 * - 交互菜单只调用这里的高层函数，避免 CityConnection 模块继续膨胀。
 */

import { spawnSync } from "node:child_process";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { CityUserManager } from "./CityUserManager.js";
import type {
  CityBalanceAccount,
  CityBalanceTopup,
  CityCheckoutResult,
  CityRechargeInput,
  CityRechargeResult,
} from "../types/CityBalance.js";

const DEFAULT_PAYMENT_METHOD_ID = "stripe";
const cityUserManager = new CityUserManager();

/**
 * 读取当前 City City user 的余额。
 */
export async function readCurrentCityBalance(): Promise<CityBalanceAccount> {
  const { user, client } = await cityUserManager.createUserClient();
  const account = await client.service("balance").get<CityBalanceAccount>("me");
  assertBalanceUserMatchesToken(account, user.user_id);
  return account;
}

/**
 * 给当前 City City user 发起充值。
 */
export async function rechargeCurrentCityUser(
  input: CityRechargeInput,
): Promise<CityRechargeResult> {
  const { client } = await cityUserManager.createUserClient();
  const amount = normalizePositiveInteger(input.amount, "amount");
  const method_id = normalizeText(input.method_id) || DEFAULT_PAYMENT_METHOD_ID;
  const topup = await client.service("balance").action("topups/create").invoke<CityBalanceTopup>({
    amount,
    note: normalizeText(input.note) || "City user recharge",
    ref: normalizeText(input.ref),
    meta: {
      source: "city-cli",
      method_id,
    },
  });
  const checkout = await client.payment.method(method_id).invoke<CityCheckoutResult>({
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

function assertBalanceUserMatchesToken(
  account: CityBalanceAccount,
  token_user_id: string | undefined,
): void {
  if (!token_user_id) {
    throw new Error("City user token resolved without a user_id. Run `city city login` again.");
  }
  if (account.user_id !== token_user_id) {
    throw new Error([
      "Balance account user does not match the authenticated token.",
      `balance=${account.user_id}`,
      `token=${token_user_id}`,
      "Run `city city logout` and then `city city login`.",
    ].join(" "));
  }
}

/**
 * 输出当前 user 余额。
 */
export async function emitCurrentCityBalance(): Promise<void> {
  const account = await readCurrentCityBalance();

  emitCliBlock({
    tone: "success",
    title: "User balance",
    summary: String(account.balance),
    facts: [
      { label: "user", value: account.user_id },
      { label: "balance", value: String(account.balance) },
      { label: "updated", value: account.updated_at },
    ],
  });
}

/**
 * 输出当前 user 充值结果。
 */
export function emitCityRechargeResult(result: CityRechargeResult): void {
  const checkout_url = normalizeText(result.checkout.checkout_url);
  emitCliBlock({
    tone: checkout_url ? "success" : "warning",
    title: "User recharge",
    summary: result.topup.status,
    facts: [
      { label: "amount", value: String(result.topup.amount) },
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

function normalizePositiveInteger(value: unknown, label: string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return amount;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function openBrowser(url: string): boolean {
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
  } catch {
    return false;
  }
}
