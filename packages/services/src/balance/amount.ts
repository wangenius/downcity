/**
 * Balance 金额换算工具。
 *
 * 关键说明（中文）
 * - 金额输入与 `amount` 展示字段使用 credits
 * - 内部账务与管理端余额字段 `balance` / `balance_after` 使用 microcredits
 * - 用户侧 `/v1/balance/me` 使用 credits 作为主字段，并补充 microcredits
 * - 存储与扣款统一使用 microcredits
 * - 所有转换集中在这里，避免各模块重复处理精度
 */

import {
  CREDIT_DECIMAL_PLACES,
  MICROCREDITS_PER_CREDIT,
} from "../types/Amount.ts";

/**
 * 将 credits 输入标准化为 microcredits。
 */
export function normalizeCreditsToMicrocredits(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive credits amount`);
  }

  const microcredits = Math.round(normalized * MICROCREDITS_PER_CREDIT);
  if (!Number.isSafeInteger(microcredits) || microcredits <= 0) {
    throw new TypeError(`${label} is outside the supported credits range`);
  }
  return microcredits;
}

/**
 * 将 credits 输入标准化为非负 microcredits。
 */
export function normalizeNonNegativeCreditsToMicrocredits(value: unknown, label: string): number {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a non-negative credits amount`);
  }

  const microcredits = Math.round(normalized * MICROCREDITS_PER_CREDIT);
  if (!Number.isSafeInteger(microcredits) || microcredits < 0) {
    throw new TypeError(`${label} is outside the supported credits range`);
  }
  return microcredits;
}

/**
 * 标准化直接传入的 microcredits 整数。
 */
export function normalizeMicrocredits(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive microcredits integer`);
  }
  return normalized;
}

/**
 * 标准化非负 microcredits 整数。
 */
export function normalizeNonNegativeMicrocredits(value: unknown, label: string): number {
  const normalized = Number(value ?? 0);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a non-negative microcredits integer`);
  }
  return normalized;
}

/**
 * 从请求体中读取金额，优先使用 amount_microcredits。
 */
export function readAmountMicrocredits(input: {
  amount?: unknown;
  amount_microcredits?: unknown;
}, label = "amount"): number {
  if (input.amount_microcredits !== undefined) {
    return normalizeMicrocredits(input.amount_microcredits, `${label}_microcredits`);
  }
  return normalizeCreditsToMicrocredits(input.amount, label);
}

/**
 * 从请求体中读取非负金额，优先使用 amount_microcredits。
 */
export function readNonNegativeAmountMicrocredits(input: {
  amount?: unknown;
  amount_microcredits?: unknown;
}, label = "amount"): number {
  if (input.amount_microcredits !== undefined) {
    return normalizeNonNegativeMicrocredits(input.amount_microcredits, `${label}_microcredits`);
  }
  return normalizeNonNegativeCreditsToMicrocredits(input.amount, label);
}

/**
 * 将 microcredits 转换成最多 6 位小数的 credits。
 */
export function microcreditsToCredits(value: unknown): number {
  const microcredits = Number(value ?? 0);
  return Number((microcredits / MICROCREDITS_PER_CREDIT).toFixed(CREDIT_DECIMAL_PLACES));
}

/**
 * 将 microcredits 转成 USD cents，供支付 provider 使用。
 */
export function microcreditsToUsdCents(value: unknown): number {
  const microcredits = Number(value ?? 0);
  const cents = Math.round((microcredits / MICROCREDITS_PER_CREDIT) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new TypeError("amount_usd_cents must be a positive integer");
  }
  return cents;
}

/**
 * 格式化 credits 展示文本。
 */
export function formatCredits(value: unknown): string {
  const credits = microcreditsToCredits(value);
  return credits.toFixed(CREDIT_DECIMAL_PLACES).replace(/\.?0+$/, "");
}
