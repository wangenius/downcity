/**
 * User Balance 命令。
 *
 * 提供：
 * - 查看当前余额
 * - 查看个人流水
 * - 查看个人充值单
 * - 发起充值
 * - 兑换 redeem_code
 */

import type { UserClient } from "@downcity/city";
import { openBrowser } from "../core/browser.js";
import { buildStripeEndpoints } from "../core/stripe.js";
import { askText, show, showError, showSuccess } from "../core/ui.js";

interface BalanceAccount {
  /** 用户 ID */
  user_id: string;
  /** 当前余额 */
  balance: number;
  /** 余额单位 */
  unit: string;
}

interface BalanceLedgerItem {
  /** 流水类型 */
  kind: string;
  /** 流水金额 */
  amount: number;
  /** 余额快照 */
  balance_after: number;
  /** 流水说明 */
  note: string;
  /** 创建时间 */
  created_at: string;
}

interface BalanceTopupItem {
  /** 充值单 ID */
  topup_id: string;
  /** 充值金额 */
  amount: number;
  /** 余额单位 */
  unit: string;
  /** 充值单状态 */
  status: string;
  /** 充值说明 */
  note: string;
  /** 创建时间 */
  created_at: string;
}

interface StripeCheckoutResult {
  /** 支付记录 ID */
  payment_id: string;
  /** 对应的充值单 ID */
  topup_id: string;
  /** Stripe Checkout Session ID */
  stripe_checkout_session_id: string;
  /** 可直接跳转的支付地址 */
  checkout_url: string;
  /** 当前支付状态 */
  status: string;
}

interface BalanceRedeemCodeItem {
  /** redeem_code ID */
  redeem_code_id: string;
  /** redeem_code 状态 */
  status: string;
  /** 脱敏兑换码 */
  code_mask: string;
  /** 兑换金额 */
  amount: number;
  /** 余额单位 */
  unit: string;
}

interface BalanceRedeemResult {
  /** 兑换后的账户快照 */
  account: BalanceAccount;
  /** 被兑换的 redeem_code */
  redeem_code: BalanceRedeemCodeItem;
}

/** 展示当前余额 */
export async function showBalance(c: UserClient): Promise<void> {
  const account = await c.service("balance").get<BalanceAccount>("me");
  show([
    `user_id: ${account.user_id}`,
    `balance: ${account.balance} ${account.unit}`,
  ].join("\n"));
}

/** 展示个人流水 */
export async function showBalanceHistory(c: UserClient): Promise<void> {
  const response = await c.service("balance").get<{ items: BalanceLedgerItem[] }>("history/me", { limit: 20 });
  if (response.items.length === 0) {
    show("No balance history yet.");
    return;
  }

  console.log(`\n${response.items.length} balance entries:\n`);
  for (const item of response.items) {
    console.log(`  ${item.created_at.slice(0, 19)}  ${item.kind.padEnd(8)} ${String(item.amount).padStart(6)}  -> ${String(item.balance_after).padStart(6)}  ${item.note}`);
  }
  console.log("");
}

/** 展示个人充值单 */
export async function showTopups(c: UserClient): Promise<void> {
  const response = await c.service("balance").get<{ items: BalanceTopupItem[] }>("topups/me", { limit: 20 });
  if (response.items.length === 0) {
    show("No topup orders yet.");
    return;
  }

  console.log(`\n${response.items.length} topup orders:\n`);
  for (const item of response.items) {
    console.log(`  ${item.topup_id.padEnd(24)} ${String(item.amount).padStart(6)} ${item.unit.padEnd(10)} [${item.status}] ${item.note}`);
  }
  console.log("");
}

/** 发起充值 */
export async function createTopup(c: UserClient): Promise<void> {
  const result = await createTopupOrder(c);
  if (!result) return;
  showSuccess(`topup created: ${result.topup_id} (${result.amount} ${result.unit}, ${result.status})`);
}

/**
 * 发起 Stripe 充值。
 *
 * 关键说明（中文）
 * - 先创建 pending topup
 * - 再调用 payment.stripe 创建 Checkout
 * - 成功后尽量自动打开浏览器
 */
export async function rechargeWithStripe(c: UserClient): Promise<void> {
  const topup = await createTopupOrder(c);
  if (!topup) return;
  const endpoints = buildStripeEndpoints(c.serverUrl);

  showSuccess(`topup created: ${topup.topup_id} (${topup.amount} ${topup.unit}, ${topup.status})`);

  const successURL = await askText("success_url override (optional)");
  const cancelURL = await askText("cancel_url override (optional)");

  try {
    const checkout = await c.service("payment.stripe").action("checkout/create").invoke<StripeCheckoutResult>({
      topup_id: topup.topup_id,
      success_url: successURL ?? "",
      cancel_url: cancelURL ?? "",
    });

    const opened = openBrowser(checkout.checkout_url);
    showSuccess(`checkout created: ${checkout.payment_id}`);
    show([
      `topup_id: ${checkout.topup_id}`,
      `checkout_url: ${checkout.checkout_url}`,
      `status: ${checkout.status}`,
      `stripe webhook endpoint: ${endpoints.webhook_url}`,
    ].join("\n"));

    if (opened) {
      show("Browser opened for Stripe Checkout.");
    } else {
      showError(`Could not open browser. Please visit:\n  ${checkout.checkout_url}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError([
      "Stripe checkout creation failed.",
      `topup_id: ${topup.topup_id}`,
      `error: ${message}`,
      `stripe webhook endpoint: ${endpoints.webhook_url}`,
      "You can keep this pending topup and retry checkout later.",
    ].join("\n"));
  }
}

/**
 * 创建充值单。
 */
async function createTopupOrder(c: UserClient): Promise<BalanceTopupItem | undefined> {
  const rawAmount = await askText("topup amount");
  if (!rawAmount) return undefined;

  const amount = Number(rawAmount);
  if (!Number.isInteger(amount) || amount <= 0) {
    showError("topup amount must be a positive integer");
    return undefined;
  }

  const note = await askText("topup note (optional)");
  return await c.service("balance").action("topups/create").invoke<BalanceTopupItem>({
    amount,
    note: note ?? "",
  });
}

/** 兑换 redeem_code */
export async function redeemCode(c: UserClient): Promise<void> {
  const code = await askText("redeem_code");
  if (!code) return;

  const result = await c.service("balance").action("redeem-codes/redeem").invoke<BalanceRedeemResult>({
    code,
  });
  showSuccess(
    `redeemed: ${result.redeem_code.code_mask} -> +${result.redeem_code.amount} ${result.redeem_code.unit} (balance: ${result.account.balance} ${result.account.unit})`,
  );
}
