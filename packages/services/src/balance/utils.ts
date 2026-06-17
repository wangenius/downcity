/**
 * Balance 服务通用工具。
 *
 * 关键说明（中文）
 * - 所有输入都在这里统一做标准化
 * - redeem_code 明文只在创建时短暂存在，落库前必须哈希
 */

import type {
  BalanceAccount,
  BalanceCharge,
  BalanceChargeStatus,
  BalanceUserBalance,
  BalanceLedgerEntry,
  BalanceLedgerKind,
  BalanceTopup,
  BalanceTopupStatus,
  BalanceRedeemCode,
  BalanceRedeemCodeStatus,
} from "./types.js";
import {
  formatCredits,
  microcreditsToCredits,
  microcreditsToUsdCents,
} from "./amount.js";
import {
  CREDIT_DECIMAL_PLACES,
  MICROCREDITS_PER_CREDIT,
} from "../types/Amount.js";

const REDEEM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * 读取必填字符串。
 */
export function readRequired(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

/**
 * 标准化用户 ID。
 */
export function normalizeUserId(value: string): string {
  return readRequired(value, "user_id");
}

/**
 * 标准化正整数。
 */
export function normalizePositiveInteger(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return normalized;
}

/**
 * 标准化非负整数。
 */
export function normalizeNonNegativeInteger(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return normalized;
}

/**
 * 标准化 limit。
 */
export function normalizeLimit(value: unknown): number {
  const normalized = Number(value ?? 20);
  if (!Number.isInteger(normalized) || normalized <= 0) return 20;
  return Math.min(normalized, 200);
}

/**
 * 标准化普通文本。
 */
export function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * 序列化 meta。
 */
export function stringifyMeta(meta: Record<string, unknown> | undefined): string {
  return JSON.stringify(meta ?? {});
}

/**
 * 解析 meta JSON。
 */
export function parseMetaJSON(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

/**
 * 合并 meta JSON。
 */
export function mergeMetaJSON(current: string, next: Record<string, unknown> | undefined): string {
  return JSON.stringify({
    ...parseMetaJSON(current),
    ...(next ?? {}),
  });
}

/**
 * 生成随机 ID。
 */
export function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * 标准化 redeem_code 明文。
 *
 * 关键说明（中文）
 * - 允许用户输入时带空格或连字符
 * - 最终统一成不带分隔符的大写文本再做哈希
 */
export function normalizeRedeemCode(value: unknown, label = "code"): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");

  if (!normalized) {
    throw new TypeError(`${label} is required`);
  }

  if (!/^[A-Z0-9]+$/.test(normalized)) {
    throw new TypeError(`${label} must contain only letters and numbers`);
  }

  return normalized;
}

/**
 * 生成 redeem_code 明文。
 */
export function generateRedeemCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const chars = Array.from(bytes, (value) => REDEEM_CODE_ALPHABET[value % REDEEM_CODE_ALPHABET.length]);
  return [
    chars.slice(0, 4).join(""),
    chars.slice(4, 8).join(""),
    chars.slice(8, 12).join(""),
    chars.slice(12, 16).join(""),
  ].join("-");
}

/**
 * 生成脱敏 redeem_code。
 */
export function maskRedeemCode(code: string): string {
  const normalized = normalizeRedeemCode(code);
  const head = normalized.slice(0, 4);
  const tail = normalized.slice(-4);
  const middleLength = Math.max(0, normalized.length - head.length - tail.length);
  return `${head}${middleLength > 0 ? `-${"*".repeat(middleLength)}` : ""}${tail ? `-${tail}` : ""}`;
}

/**
 * 计算 redeem_code 哈希值。
 */
export async function hashRedeemCode(code: string): Promise<string> {
  const normalized = normalizeRedeemCode(code);
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 标准化 redeem_code 状态。
 */
export function normalizeRedeemCodeStatus(value: unknown): BalanceRedeemCodeStatus | undefined {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  if (normalized === "active" || normalized === "redeemed" || normalized === "disabled") {
    return normalized;
  }
  throw new TypeError("status must be one of: active, redeemed, disabled");
}

/**
 * 解析账户行。
 */
export function parseAccountRow(row: BalanceAccount): BalanceAccount {
  const balance = Number(row.balance ?? row.balance_microcredits);
  return {
    user_id: String(row.user_id),
    balance,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/**
 * 将内部余额账户转换成用户侧展示对象。
 */
export function toBalanceUserView(account: BalanceAccount): BalanceUserBalance {
  const microcredits = Number(account.balance ?? 0);
  return {
    user_id: String(account.user_id),
    balance: microcreditsToCredits(microcredits),
    unit: "credits",
    microcredits,
    conversion: {
      microcredits_per_credit: MICROCREDITS_PER_CREDIT,
      credit_decimals: CREDIT_DECIMAL_PLACES,
    },
    display: formatCredits(microcredits),
    created_at: String(account.created_at),
    updated_at: String(account.updated_at),
  };
}

/**
 * 解析流水行。
 */
export function parseLedgerRow(row: BalanceLedgerEntry): BalanceLedgerEntry {
  const amount = Number(row.amount ?? row.amount_microcredits);
  const balance_after = Number(row.balance_after ?? row.balance_after_microcredits);
  return {
    entry_id: String(row.entry_id),
    user_id: String(row.user_id),
    kind: String(row.kind) as BalanceLedgerKind,
    amount,
    balance_after,
    note: String(row.note ?? ""),
    ref: String(row.ref ?? ""),
    metadata_json: String(row.metadata_json ?? "{}"),
    created_at: String(row.created_at),
  };
}

/**
 * 解析充值单行。
 */
export function parseTopupRow(row: BalanceTopup): BalanceTopup {
  const amount = Number(row.amount ?? row.amount_microcredits);
  return {
    topup_id: String(row.topup_id),
    user_id: String(row.user_id),
    amount,
    amount_usd_cents: microcreditsToUsdCents(amount),
    status: String(row.status) as BalanceTopupStatus,
    note: String(row.note ?? ""),
    ref: String(row.ref ?? ""),
    metadata_json: String(row.metadata_json ?? "{}"),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/**
 * 解析 redeem_code 行。
 */
export function parseRedeemCodeRow(row: BalanceRedeemCode & { code_hash?: string }): BalanceRedeemCode {
  const amount = Number(row.amount ?? row.amount_microcredits);
  return {
    redeem_code_id: String(row.redeem_code_id),
    amount,
    status: String(row.status) as BalanceRedeemCodeStatus,
    code_mask: String(row.code_mask ?? ""),
    note: String(row.note ?? ""),
    ref: String(row.ref ?? ""),
    metadata_json: String(row.metadata_json ?? "{}"),
    redeemed_by_user_id: String(row.redeemed_by_user_id ?? ""),
    redeemed_at: String(row.redeemed_at ?? ""),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/**
 * 解析通用扣费记录行。
 */
export function parseChargeRow(row: BalanceCharge): BalanceCharge {
  const amount_microcredits = Number(row.amount_microcredits ?? 0);
  return {
    charge_id: String(row.charge_id),
    user_id: String(row.user_id),
    amount: microcreditsToCredits(amount_microcredits),
    amount_microcredits,
    status: String(row.status ?? "settled") as BalanceChargeStatus,
    note: String(row.note ?? ""),
    ref: String(row.ref ?? ""),
    metadata_json: String(row.metadata_json ?? "{}"),
    created_at: String(row.created_at),
  };
}
