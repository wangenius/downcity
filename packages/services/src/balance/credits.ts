/**
 * Balance 金额换算工具。
 *
 * 关键说明（中文）
 * - credits 是系统唯一账务单位，所有输入、存储、扣款与返回账务字段都使用 credits 整数
 * - 1 USD = 1_000_000 credits
 * - 用户侧 `/v1/balance/me` 使用 `credits` 作为主字段，并补充 USD 展示字段
 * - 所有转换集中在这里，避免各模块重复处理精度
 */

import {
  CREDITS_PER_USD,
  USD_DECIMAL_PLACES,
} from "../types/Amount.js";

/**
 * 标准化正数 credits 整数。
 */
export function normalizeCredits(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive credits integer`);
  }
  return normalized;
}

/**
 * 标准化非负 credits 整数。
 */
export function normalizeNonNegativeCredits(value: unknown, label: string): number {
  const normalized = Number(value ?? 0);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a non-negative credits integer`);
  }
  return normalized;
}

/**
 * 从请求体中读取正数 credits。
 */
export function readCredits(input: { credits?: unknown }, label = "credits"): number {
  return normalizeCredits(input.credits, label);
}

/**
 * 从请求体中读取非负 credits。
 */
export function readNonNegativeCredits(input: { credits?: unknown }, label = "credits"): number {
  return normalizeNonNegativeCredits(input.credits, label);
}

/**
 * 将 credits 转换成 USD 数字。
 */
export function creditsToUsd(value: unknown): number {
  const credits = Number(value ?? 0);
  return Number((credits / CREDITS_PER_USD).toFixed(USD_DECIMAL_PLACES));
}

/**
 * 将 credits 转成 USD cents，供支付 provider 使用。
 */
export function creditsToUsdCents(value: unknown): number {
  const credits = Number(value ?? 0);
  const cents = Math.round(credits / (CREDITS_PER_USD / 100));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new TypeError("usd_cents must be a positive integer");
  }
  return cents;
}

/**
 * 格式化 USD 展示文本。
 */
export function formatUsd(value: unknown): string {
  return `$${creditsToUsd(value).toFixed(2)}`;
}
