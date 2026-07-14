/**
 * Balance 原子账务操作存储。
 *
 * 关键说明（中文）
 * - 余额快照、流水、扣费记录和业务状态必须在同一个 SQLite/D1 事务内提交。
 * - operation_id 是唯一幂等边界；只有 pending 操作可以改变余额。
 * - 任一 SQL 失败时整批回滚，不允许产生“已支付但未入账”等半完成状态。
 */

import { httpError } from "@downcity/city";
import {
  ACCOUNT_TABLE,
  CHARGE_TABLE,
  LEDGER_TABLE,
  OPERATION_TABLE,
  REDEEM_CODE_TABLE,
  TOPUP_TABLE,
} from "./schema.js";
import { rawAtomic, rawFirst } from "./raw.js";
import type {
  BalanceAccount,
  BalanceCharge,
  BalanceRedeemCode,
  BalanceTopup,
} from "./types.js";
import type {
  ApplyBalanceChargeInput,
  ApplyBalanceCreditExtra,
  ApplyBalanceDeltaInput,
  BalanceOperationRow,
} from "./types/BalanceOperation.js";
import {
  parseAccountRow,
  parseChargeRow,
  parseRedeemCodeRow,
  parseTopupRow,
  randomId,
  readRequired,
} from "./utils.js";

/** 原子账务存储。 */
export class BalanceOperationStore {
  constructor(
    private readonly resolve_raw: () => unknown,
    private readonly init_credits: number,
  ) {}

  /** 确保用户账户和初始流水同时存在。 */
  async ensure_account(user_id: string): Promise<void> {
    const now = new Date().toISOString();
    const entry_id = `bal_init:${user_id}`;
    await rawAtomic(this.resolve_raw(), [
      {
        sql: [
          `INSERT OR IGNORE INTO ${ACCOUNT_TABLE} (user_id, credits, created_at, updated_at)`,
          "VALUES (?, ?, ?, ?)",
        ].join(" "),
        params: [user_id, this.init_credits, now, now],
      },
      {
        sql: [
          `INSERT OR IGNORE INTO ${LEDGER_TABLE}`,
          "(entry_id, user_id, kind, credits_delta, credits_after, note, ref, metadata_json, created_at)",
          "SELECT ?, user_id, ?, ?, credits, ?, ?, ?, ?",
          `FROM ${ACCOUNT_TABLE}`,
          "WHERE user_id = ? AND created_at = ? AND ? > 0",
        ].join(" "),
        params: [
          entry_id,
          "init",
          this.init_credits,
          "initial balance",
          "",
          "{}",
          now,
          user_id,
          now,
          this.init_credits,
        ],
      },
    ]);
  }

  /** 原子应用一次普通余额变化并返回最新账户。 */
  async apply_delta(input: ApplyBalanceDeltaInput): Promise<BalanceAccount> {
    await this.ensure_account(input.user_id);
    const operation_id = `delta:${randomId()}`;
    const entry_id = `bal_${randomId()}`;
    const now = new Date().toISOString();
    await rawAtomic(this.resolve_raw(), [
      this.create_operation_command({
        operation_id,
        kind: input.ledger_kind,
        record_id: entry_id,
        user_id: input.user_id,
        credits_delta: input.credits_delta,
        created_at: now,
      }),
      this.create_account_update_command(operation_id),
      {
        sql: [
          `INSERT INTO ${LEDGER_TABLE}`,
          "(entry_id, user_id, kind, credits_delta, credits_after, note, ref, metadata_json, created_at)",
          "SELECT ?, operation.user_id, ?, operation.credits_delta, account.credits, ?, ?, ?, ?",
          `FROM ${OPERATION_TABLE} operation`,
          `JOIN ${ACCOUNT_TABLE} account ON account.user_id = operation.user_id`,
          "WHERE operation.operation_id = ? AND operation.status = ?",
        ].join(" "),
        params: [
          entry_id,
          input.ledger_kind,
          input.note,
          input.ref,
          input.metadata_json,
          now,
          operation_id,
          "pending",
        ],
      },
      this.create_operation_complete_command(operation_id, now),
    ]);
    return await this.read_account(input.user_id);
  }

  /** 原子执行一笔幂等扣费。 */
  async charge(input: ApplyBalanceChargeInput): Promise<BalanceCharge> {
    await this.ensure_account(input.user_id);
    // 关键点（中文）：开户及 init 流水必须先完成，扣费时间不能早于首次开户时间。
    const created_at = new Date().toISOString();
    const idempotency_key = normalize_idempotency_key(input.idempotency_key);
    const operation_id = idempotency_key
      ? `charge:${idempotency_key}`
      : `charge:${input.charge_id}`;
    const ledger_entry_id = `bal_charge:${operation_id}`;
    await rawAtomic(this.resolve_raw(), [
      this.create_operation_command({
        operation_id,
        kind: "charge",
        record_id: input.charge_id,
        user_id: input.user_id,
        credits_delta: -input.credits,
        created_at,
      }),
      this.create_account_update_command(operation_id),
      {
        sql: [
          `INSERT OR IGNORE INTO ${LEDGER_TABLE}`,
          "(entry_id, user_id, kind, credits_delta, credits_after, note, ref, metadata_json, created_at)",
          "SELECT ?, operation.user_id, ?, operation.credits_delta, account.credits, ?, ?, ?, ?",
          `FROM ${OPERATION_TABLE} operation`,
          `JOIN ${ACCOUNT_TABLE} account ON account.user_id = operation.user_id`,
          "WHERE operation.operation_id = ? AND operation.status = ?",
        ].join(" "),
        params: [
          ledger_entry_id,
          "charge",
          input.note,
          input.ref,
          input.ledger_metadata_json,
          created_at,
          operation_id,
          "pending",
        ],
      },
      {
        sql: [
          `INSERT OR IGNORE INTO ${CHARGE_TABLE}`,
          "(charge_id, user_id, credits, status, note, ref, metadata_json, created_at)",
          "SELECT record_id, user_id, ABS(credits_delta), ?, ?, ?, ?, ?",
          `FROM ${OPERATION_TABLE}`,
          "WHERE operation_id = ? AND status = ?",
        ].join(" "),
        params: [
          "settled",
          input.note,
          input.ref,
          input.metadata_json,
          created_at,
          operation_id,
          "pending",
        ],
      },
      this.create_operation_complete_command(operation_id, created_at),
    ]);

    const operation = await this.read_operation(operation_id);
    if (
      operation.user_id !== input.user_id ||
      operation.credits_delta !== -input.credits
    ) {
      throw httpError(409, "idempotency_key was already used for a different charge");
    }
    return await this.read_charge(operation.record_id);
  }

  /** 原子完成充值单并入账；重复调用返回首次结果。 */
  async finish_topup(
    topup_id: string,
    extra: ApplyBalanceCreditExtra,
  ): Promise<BalanceTopup> {
    const current = await this.read_topup(topup_id);
    if (current.status !== "pending") {
      throw httpError(409, `topup is already ${current.status}`);
    }
    await this.ensure_account(current.user_id);
    const operation_id = `topup:${topup_id}`;
    const entry_id = `bal_topup:${topup_id}`;
    const now = new Date().toISOString();
    await rawAtomic(this.resolve_raw(), [
      {
        sql: [
          `INSERT OR IGNORE INTO ${OPERATION_TABLE}`,
          "(operation_id, kind, record_id, user_id, credits_delta, status, created_at, applied_at)",
          "SELECT ?, ?, topup_id, user_id, credits, ?, ?, ?",
          `FROM ${TOPUP_TABLE}`,
          "WHERE topup_id = ? AND status = ?",
        ].join(" "),
        params: [operation_id, "topup", "pending", now, "", topup_id, "pending"],
      },
      this.create_account_update_command(operation_id),
      this.create_credit_ledger_command({
        operation_id,
        entry_id,
        ledger_kind: "topup",
        extra,
        created_at: now,
      }),
      {
        sql: [
          `UPDATE ${TOPUP_TABLE}`,
          "SET status = ?, updated_at = ?, note = ?, ref = ?, metadata_json = ?",
          "WHERE topup_id = ? AND status = ?",
          `AND EXISTS (SELECT 1 FROM ${OPERATION_TABLE} WHERE operation_id = ? AND status = ?)`,
        ].join(" "),
        params: [
          "paid",
          now,
          extra.note,
          extra.ref,
          extra.metadata_json,
          topup_id,
          "pending",
          operation_id,
          "pending",
        ],
      },
      this.create_operation_complete_command(operation_id, now),
    ]);
    const result = await this.read_topup(topup_id);
    if (result.status !== "paid") {
      throw httpError(409, `topup is already ${result.status}`);
    }
    return result;
  }

  /** 原子兑换一次兑换码并入账；重复调用仅对原用户返回首次结果。 */
  async redeem_code(
    current: BalanceRedeemCode & { code_hash?: string },
    user_id: string,
    extra: ApplyBalanceCreditExtra,
  ): Promise<{ account: BalanceAccount; redeem_code: BalanceRedeemCode }> {
    if (current.status !== "active") {
      throw httpError(409, `redeem_code is already ${current.status}`);
    }
    await this.ensure_account(user_id);
    const operation_id = `redeem:${current.redeem_code_id}`;
    const entry_id = `bal_redeem:${current.redeem_code_id}`;
    const now = new Date().toISOString();
    await rawAtomic(this.resolve_raw(), [
      {
        sql: [
          `INSERT OR IGNORE INTO ${OPERATION_TABLE}`,
          "(operation_id, kind, record_id, user_id, credits_delta, status, created_at, applied_at)",
          "SELECT ?, ?, redeem_code_id, ?, credits, ?, ?, ?",
          `FROM ${REDEEM_CODE_TABLE}`,
          "WHERE redeem_code_id = ? AND status = ?",
        ].join(" "),
        params: [
          operation_id,
          "redeem",
          user_id,
          "pending",
          now,
          "",
          current.redeem_code_id,
          "active",
        ],
      },
      this.create_account_update_command(operation_id),
      this.create_credit_ledger_command({
        operation_id,
        entry_id,
        ledger_kind: "redeem",
        extra,
        created_at: now,
      }),
      {
        sql: [
          `UPDATE ${REDEEM_CODE_TABLE}`,
          "SET status = ?, redeemed_by_user_id = ?, redeemed_at = ?, updated_at = ?, note = ?, ref = ?, metadata_json = ?",
          "WHERE redeem_code_id = ? AND status = ?",
          `AND EXISTS (SELECT 1 FROM ${OPERATION_TABLE} WHERE operation_id = ? AND status = ?)`,
        ].join(" "),
        params: [
          "redeemed",
          user_id,
          now,
          now,
          extra.note,
          extra.ref,
          extra.metadata_json,
          current.redeem_code_id,
          "active",
          operation_id,
          "pending",
        ],
      },
      this.create_operation_complete_command(operation_id, now),
    ]);
    const redeem_code = await this.read_redeem_code(current.redeem_code_id);
    if (redeem_code.status !== "redeemed") {
      throw httpError(409, `redeem_code is already ${redeem_code.status}`);
    }
    if (redeem_code.redeemed_by_user_id !== user_id) {
      throw httpError(409, "redeem_code was already redeemed by another user");
    }
    return {
      account: await this.read_account(user_id),
      redeem_code,
    };
  }

  private create_operation_command(input: {
    operation_id: string;
    kind: string;
    record_id: string;
    user_id: string;
    credits_delta: number;
    created_at: string;
  }) {
    return {
      sql: [
        `INSERT OR IGNORE INTO ${OPERATION_TABLE}`,
        "(operation_id, kind, record_id, user_id, credits_delta, status, created_at, applied_at)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
      params: [
        input.operation_id,
        input.kind,
        input.record_id,
        input.user_id,
        input.credits_delta,
        "pending",
        input.created_at,
        "",
      ],
    };
  }

  private create_account_update_command(operation_id: string) {
    return {
      sql: [
        `UPDATE ${ACCOUNT_TABLE}`,
        `SET credits = credits + (SELECT credits_delta FROM ${OPERATION_TABLE} WHERE operation_id = ?), updated_at = ?`,
        `WHERE user_id = (SELECT user_id FROM ${OPERATION_TABLE} WHERE operation_id = ?)`,
        `AND EXISTS (SELECT 1 FROM ${OPERATION_TABLE} WHERE operation_id = ? AND status = ?)`,
      ].join(" "),
      params: [operation_id, new Date().toISOString(), operation_id, operation_id, "pending"],
    };
  }

  private create_credit_ledger_command(input: {
    operation_id: string;
    entry_id: string;
    ledger_kind: "topup" | "redeem";
    extra: ApplyBalanceCreditExtra;
    created_at: string;
  }) {
    return {
      sql: [
        `INSERT OR IGNORE INTO ${LEDGER_TABLE}`,
        "(entry_id, user_id, kind, credits_delta, credits_after, note, ref, metadata_json, created_at)",
        "SELECT ?, operation.user_id, ?, operation.credits_delta, account.credits, ?, ?, ?, ?",
        `FROM ${OPERATION_TABLE} operation`,
        `JOIN ${ACCOUNT_TABLE} account ON account.user_id = operation.user_id`,
        "WHERE operation.operation_id = ? AND operation.status = ?",
      ].join(" "),
      params: [
        input.entry_id,
        input.ledger_kind,
        input.extra.note,
        input.extra.ref,
        input.extra.metadata_json,
        input.created_at,
        input.operation_id,
        "pending",
      ],
    };
  }

  private create_operation_complete_command(operation_id: string, applied_at: string) {
    return {
      sql: [
        `UPDATE ${OPERATION_TABLE}`,
        "SET status = ?, applied_at = ?",
        "WHERE operation_id = ? AND status = ?",
      ].join(" "),
      params: ["applied", applied_at, operation_id, "pending"],
    };
  }

  private async read_operation(operation_id: string): Promise<BalanceOperationRow> {
    const row = await rawFirst<BalanceOperationRow>(this.resolve_raw(), [
      "SELECT operation_id, kind, record_id, user_id, credits_delta, status, created_at, applied_at",
      `FROM ${OPERATION_TABLE} WHERE operation_id = ?`,
    ].join(" "), [operation_id]);
    if (!row) throw new Error(`balance operation not found: ${operation_id}`);
    return {
      ...row,
      credits_delta: Number(row.credits_delta),
    };
  }

  private async read_account(user_id: string): Promise<BalanceAccount> {
    const row = await rawFirst<BalanceAccount>(this.resolve_raw(), [
      "SELECT user_id, credits, created_at, updated_at",
      `FROM ${ACCOUNT_TABLE} WHERE user_id = ?`,
    ].join(" "), [user_id]);
    if (!row) throw httpError(404, `balance account not found for user ${user_id}`);
    return parseAccountRow(row);
  }

  private async read_charge(charge_id: string): Promise<BalanceCharge> {
    const row = await rawFirst<BalanceCharge>(this.resolve_raw(), [
      "SELECT charge_id, user_id, credits, status, note, ref, metadata_json, created_at",
      `FROM ${CHARGE_TABLE} WHERE charge_id = ?`,
    ].join(" "), [charge_id]);
    if (!row) throw new Error(`balance charge not found: ${charge_id}`);
    return parseChargeRow(row);
  }

  private async read_topup(topup_id: string): Promise<BalanceTopup> {
    const row = await rawFirst<BalanceTopup>(this.resolve_raw(), [
      "SELECT topup_id, user_id, credits, status, note, ref, metadata_json, created_at, updated_at",
      `FROM ${TOPUP_TABLE} WHERE topup_id = ?`,
    ].join(" "), [readRequired(topup_id, "topup_id")]);
    if (!row) throw httpError(404, `topup not found: ${topup_id}`);
    return parseTopupRow(row);
  }

  private async read_redeem_code(redeem_code_id: string): Promise<BalanceRedeemCode> {
    const row = await rawFirst<BalanceRedeemCode>(this.resolve_raw(), [
      "SELECT redeem_code_id, credits, status, code_mask, note, ref, metadata_json, redeemed_by_user_id, redeemed_at, created_at, updated_at",
      `FROM ${REDEEM_CODE_TABLE} WHERE redeem_code_id = ?`,
    ].join(" "), [redeem_code_id]);
    if (!row) throw httpError(404, `redeem_code not found: ${redeem_code_id}`);
    return parseRedeemCodeRow(row);
  }
}

/** 校验并归一化公开幂等键。 */
function normalize_idempotency_key(value: string | undefined): string | undefined {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  if (normalized.length > 200) {
    throw new TypeError("idempotency_key must not exceed 200 characters");
  }
  return normalized;
}
