/**
 * Downcity 官方 Balance 服务实现。
 *
 * 设计边界：
 * - 余额是用户级全局钱包，不与 town 绑定
 * - 服务只负责账户、流水、充值单、redeem_code 与原子加减款
 * - 真正的计费策略应由业务方在 hook 中直接调用本服务
 */

import {
  InstallableService,
  httpError,
  type ServiceInstallContext,
} from "@downcity/city";
import { rawAll, rawFirst, rawRun } from "./raw.ts";
import { registerBalanceRoutes } from "./routes.ts";
import {
  ACCOUNT_TABLE,
  LEDGER_TABLE,
  REDEEM_CODE_TABLE,
  TOPUP_TABLE,
  balanceAccounts,
  balanceLedger,
  balanceRedeemCodes,
  balanceTopups,
} from "./schema.ts";
import type {
  BalanceAccount,
  BalanceCreateRedeemCodeInput,
  BalanceExtra,
  BalanceHistoryQuery,
  BalanceLedgerEntry,
  BalanceLedgerKind,
  BalanceServiceOptions,
  BalanceRedeemCode,
  BalanceRedeemCodeIssueResult,
  BalanceRedeemCodeQuery,
  BalanceRedeemCodeRedeemResult,
  BalanceTopup,
  BalanceTopupQuery,
} from "./types.ts";
import {
  generateRedeemCode,
  hashRedeemCode,
  maskRedeemCode,
  mergeMetaJSON,
  normalizeLimit,
  normalizeRedeemCode,
  normalizeRedeemCodeStatus,
  normalizeText,
  normalizeUserId,
  parseAccountRow,
  parseLedgerRow,
  parseMetaJSON,
  parseRedeemCodeRow,
  parseTopupRow,
  randomId,
  readRequired,
  stringifyMeta,
} from "./utils.ts";
import {
  microcreditsToCredits,
  microcreditsToUsdCents,
  readAmountMicrocredits,
  readNonNegativeAmountMicrocredits,
} from "./amount.ts";

type StoredRedeemCodeRow = BalanceRedeemCode & {
  /**
   * 兑换码哈希值。
   */
  code_hash: string;
};

/**
 * Balance 服务实例。
 *
 * 业务方应保存返回实例，并在 hook 中直接调用它的 `require()` / `sub()` / `add()`。
 */
export class BalanceService extends InstallableService {
  readonly id = "balance";
  readonly name = "Balance";
  readonly version = "0.1.0";
  readonly schema = {
    accounts: balanceAccounts,
    ledger: balanceLedger,
    topups: balanceTopups,
    redeem_codes: balanceRedeemCodes,
  };

  private readonly initMicrocredits: number;

  constructor(options: BalanceServiceOptions = {}) {
    super();
    this.initMicrocredits = readNonNegativeAmountMicrocredits({
      amount: options.init ?? 0,
      amount_microcredits: options.init_microcredits,
    }, "init");
    this.instruction = [
      "提供用户级全局余额、余额流水、充值单与 redeem_code 能力。",
      "内部账务与管理端的 `balance` / `amount` / `balance_after` 字段均使用 microcredits 整数；用户侧 `/me` 返回 credits 主字段并附带 microcredits。",
      `首次自动开户发放 ${this.initMicrocredits} microcredits。`,
      "推荐在业务 hook 中调用 require/add/sub，把具体计费策略放在业务侧，而不是写死在服务内部。",
      "管理端可查询所有账户、流水、充值单与 redeem_code；用户侧可查询自己的余额、历史记录、充值单，并直接兑换 redeem_code。",
    ].join("\n");
  }

  install(ctx: ServiceInstallContext): void {
    registerBalanceRoutes(this, ctx);
  }

  /**
   * 读取用户余额。
   *
   * 若账户不存在，会自动开户并按配置发放初始余额。
   */
  async read(user_id: string): Promise<BalanceAccount> {
    const normalizedUserId = normalizeUserId(user_id);
    await this.ensureAccount(normalizedUserId);
    return await this.readAccountRequired(normalizedUserId);
  }

  /**
   * 检查用户余额是否足够。
   *
   * 余额不足时会抛出 `402 insufficient balance`。
   */
  async require(user_id: string, amount: number): Promise<BalanceAccount> {
    return await this.requireMicrocredits(user_id, readAmountMicrocredits({ amount }));
  }

  /**
   * 检查用户余额是否足够，入参单位为 microcredits。
   */
  async requireMicrocredits(user_id: string, amount_microcredits: number): Promise<BalanceAccount> {
    const normalizedUserId = normalizeUserId(user_id);
    const normalizedAmount = readAmountMicrocredits({ amount_microcredits });
    const account = await this.read(normalizedUserId);

    if (account.balance < normalizedAmount) {
      throw httpError(402, `insufficient balance: need ${normalizedAmount} microcredits, current ${account.balance} microcredits`);
    }

    return account;
  }

  /**
   * 给用户加余额，并写入 `add` 流水。
   */
  async add(user_id: string, amount: number, extra: BalanceExtra = {}): Promise<BalanceAccount> {
    return await this.addMicrocredits(user_id, readAmountMicrocredits({ amount }), extra);
  }

  /**
   * 给用户加余额，入参单位为 microcredits。
   */
  async addMicrocredits(user_id: string, amount_microcredits: number, extra: BalanceExtra = {}): Promise<BalanceAccount> {
    return await this.applyDelta(normalizeUserId(user_id), readAmountMicrocredits({ amount_microcredits }), "add", extra);
  }

  /**
   * 给用户扣余额，并写入 `sub` 流水。
   */
  async sub(user_id: string, amount: number, extra: BalanceExtra = {}): Promise<BalanceAccount> {
    return await this.subMicrocredits(user_id, readAmountMicrocredits({ amount }), extra);
  }

  /**
   * 给用户扣余额，入参单位为 microcredits。
   */
  async subMicrocredits(user_id: string, amount_microcredits: number, extra: BalanceExtra = {}): Promise<BalanceAccount> {
    return await this.applyDelta(normalizeUserId(user_id), -readAmountMicrocredits({ amount_microcredits }), "sub", extra);
  }

  /**
   * 查询某个用户的流水。
   */
  async history(user_id: string, limit?: number | string): Promise<BalanceLedgerEntry[]> {
    return await this.listHistory({
      user_id: normalizeUserId(user_id),
      limit,
    });
  }

  /**
   * 读取一笔充值单。
   *
   * 关键说明（中文）
   * - 这是给支付桥接层使用的公开只读能力
   * - 充值单的状态流转仍然只能通过 finishTopup / cancelTopup 完成
   */
  async readTopup(topup_id: string): Promise<BalanceTopup> {
    return await this.readTopupRequired(readRequired(topup_id, "topup_id"));
  }

  /**
   * 创建充值单。
   *
   * 这一步不会直接入账，只会生成 `pending` 充值单。
   */
  async createTopup(user_id: string, amount: number | undefined, extra: BalanceExtra = {}): Promise<BalanceTopup> {
    const normalizedUserId = normalizeUserId(user_id);
    const normalizedAmount = readAmountMicrocredits({ amount });
    const now = new Date().toISOString();
    const topup: BalanceTopup = {
      topup_id: `topup_${randomId()}`,
      user_id: normalizedUserId,
      amount: normalizedAmount,
      amount_usd_cents: microcreditsToUsdCents(normalizedAmount),
      status: "pending",
      note: normalizeText(extra.note),
      ref: normalizeText(extra.ref),
      metadata_json: stringifyMeta(extra.meta),
      created_at: now,
      updated_at: now,
    };

    await this.ensureAccount(normalizedUserId);
    await rawRun(this.resolveRaw(), [
      `INSERT INTO ${TOPUP_TABLE} (topup_id, user_id, amount, status, note, ref, metadata_json, created_at, updated_at)`,
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join(" "), [
      topup.topup_id,
      topup.user_id,
      topup.amount,
      topup.status,
      topup.note,
      topup.ref,
      topup.metadata_json,
      topup.created_at,
      topup.updated_at,
    ]);

    return topup;
  }

  /**
   * 将充值单标记为完成，并真正给用户加余额。
   */
  async finishTopup(topup_id: string, extra: BalanceExtra = {}): Promise<BalanceTopup> {
    const current = await this.readTopupRequired(topup_id);
    if (current.status !== "pending") {
      throw httpError(409, `topup is already ${current.status}`);
    }

    const now = new Date().toISOString();
    const changed = await rawRun(this.resolveRaw(), [
      `UPDATE ${TOPUP_TABLE}`,
      "SET status = ?, updated_at = ?, note = ?, ref = ?, metadata_json = ?",
      "WHERE topup_id = ? AND status = ?",
    ].join(" "), [
      "paid",
      now,
      normalizeText(extra.note) || current.note,
      normalizeText(extra.ref) || current.ref,
      mergeMetaJSON(current.metadata_json, extra.meta),
      topup_id,
      "pending",
    ]);

    if (changed === 0) {
      throw httpError(409, "topup is no longer pending");
    }

    await this.applyDelta(current.user_id, current.amount, "topup", {
      note: normalizeText(extra.note) || current.note || "topup",
      ref: normalizeText(extra.ref) || topup_id,
      meta: {
        ...(parseMetaJSON(current.metadata_json)),
        ...(extra.meta ?? {}),
        topup_id,
      },
    });

    return await this.readTopupRequired(topup_id);
  }

  /**
   * 取消待处理充值单。
   */
  async cancelTopup(topup_id: string, extra: BalanceExtra = {}): Promise<BalanceTopup> {
    const current = await this.readTopupRequired(topup_id);
    if (current.status !== "pending") {
      throw httpError(409, `topup is already ${current.status}`);
    }

    const changed = await rawRun(this.resolveRaw(), [
      `UPDATE ${TOPUP_TABLE}`,
      "SET status = ?, updated_at = ?, note = ?, ref = ?, metadata_json = ?",
      "WHERE topup_id = ? AND status = ?",
    ].join(" "), [
      "canceled",
      new Date().toISOString(),
      normalizeText(extra.note) || current.note,
      normalizeText(extra.ref) || current.ref,
      mergeMetaJSON(current.metadata_json, extra.meta),
      topup_id,
      "pending",
    ]);

    if (changed === 0) {
      throw httpError(409, "topup is no longer pending");
    }

    return await this.readTopupRequired(topup_id);
  }

  /**
   * 创建一个新的 redeem_code。
   */
  async createRedeemCode(input: BalanceCreateRedeemCodeInput): Promise<BalanceRedeemCodeIssueResult> {
    const amount = readAmountMicrocredits(input, "amount");
    const now = new Date().toISOString();
    const code = input.code ? normalizeRedeemCode(input.code) : generateRedeemCode();
    const codeHash = await hashRedeemCode(code);

    if (await this.readRedeemCodeByHash(codeHash)) {
      throw httpError(409, "redeem_code already exists");
    }

    const redeemCode: BalanceRedeemCode = {
      redeem_code_id: `rc_${randomId()}`,
      amount,
      status: "active",
      code_mask: maskRedeemCode(code),
      note: normalizeText(input.note),
      ref: normalizeText(input.ref),
      metadata_json: stringifyMeta(input.meta),
      redeemed_by_user_id: "",
      redeemed_at: "",
      created_at: now,
      updated_at: now,
    };

    await rawRun(this.resolveRaw(), [
      `INSERT INTO ${REDEEM_CODE_TABLE} (redeem_code_id, code_hash, code_mask, amount, status, note, ref, metadata_json, redeemed_by_user_id, redeemed_at, created_at, updated_at)`,
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join(" "), [
      redeemCode.redeem_code_id,
      codeHash,
      redeemCode.code_mask,
      redeemCode.amount,
      redeemCode.status,
      redeemCode.note,
      redeemCode.ref,
      redeemCode.metadata_json,
      redeemCode.redeemed_by_user_id,
      redeemCode.redeemed_at,
      redeemCode.created_at,
      redeemCode.updated_at,
    ]);

    return {
      ...redeemCode,
      code,
    };
  }

  /**
   * 用户兑换 redeem_code，并立刻给余额入账。
   */
  async redeemCode(user_id: string, code: unknown, extra: BalanceExtra = {}): Promise<BalanceRedeemCodeRedeemResult> {
    const normalizedUserId = normalizeUserId(user_id);
    const normalizedCode = normalizeRedeemCode(code);
    const codeHash = await hashRedeemCode(normalizedCode);
    const current = await this.readRedeemCodeByHash(codeHash);

    if (!current) {
      throw httpError(404, "redeem_code not found");
    }

    if (current.status !== "active") {
      throw httpError(409, `redeem_code is already ${current.status}`);
    }

    const now = new Date().toISOString();
    const changed = await rawRun(this.resolveRaw(), [
      `UPDATE ${REDEEM_CODE_TABLE}`,
      "SET status = ?, redeemed_by_user_id = ?, redeemed_at = ?, updated_at = ?, note = ?, ref = ?, metadata_json = ?",
      "WHERE redeem_code_id = ? AND status = ?",
    ].join(" "), [
      "redeemed",
      normalizedUserId,
      now,
      now,
      normalizeText(extra.note) || current.note,
      normalizeText(extra.ref) || current.ref,
      mergeMetaJSON(current.metadata_json, extra.meta),
      current.redeem_code_id,
      "active",
    ]);

    if (changed === 0) {
      const latest = await this.readRedeemCodeRequired(current.redeem_code_id);
      throw httpError(409, `redeem_code is already ${latest.status}`);
    }

    const account = await this.applyDelta(normalizedUserId, current.amount, "redeem", {
      note: normalizeText(extra.note) || current.note || "redeem_code",
      ref: normalizeText(extra.ref) || current.redeem_code_id,
      meta: {
        ...(parseMetaJSON(current.metadata_json)),
        ...(extra.meta ?? {}),
        redeem_code_id: current.redeem_code_id,
        code_mask: current.code_mask,
      },
    });

    return {
      account,
      redeem_code: await this.readRedeemCodeRequired(current.redeem_code_id),
    };
  }

  /**
   * 停用一个尚未兑换的 redeem_code。
   */
  async disableRedeemCode(redeem_code_id: string, extra: BalanceExtra = {}): Promise<BalanceRedeemCode> {
    const current = await this.readRedeemCodeRequired(redeem_code_id);
    if (current.status !== "active") {
      throw httpError(409, `redeem_code is already ${current.status}`);
    }

    const changed = await rawRun(this.resolveRaw(), [
      `UPDATE ${REDEEM_CODE_TABLE}`,
      "SET status = ?, updated_at = ?, note = ?, ref = ?, metadata_json = ?",
      "WHERE redeem_code_id = ? AND status = ?",
    ].join(" "), [
      "disabled",
      new Date().toISOString(),
      normalizeText(extra.note) || current.note,
      normalizeText(extra.ref) || current.ref,
      mergeMetaJSON(current.metadata_json, extra.meta),
      redeem_code_id,
      "active",
    ]);

    if (changed === 0) {
      throw httpError(409, "redeem_code is no longer active");
    }

    return await this.readRedeemCodeRequired(redeem_code_id);
  }

  /**
   * 列出余额账户。
   */
  async listUsers(limit?: number | string): Promise<BalanceAccount[]> {
    const rows = await rawAll<BalanceAccount>(this.resolveRaw(), [
      `SELECT user_id, balance, created_at, updated_at FROM ${ACCOUNT_TABLE}`,
      "ORDER BY updated_at DESC",
      "LIMIT ?",
    ].join(" "), [normalizeLimit(limit)]);
    return rows.map(parseAccountRow);
  }

  /**
   * 列出流水。
   */
  async listHistory(query: BalanceHistoryQuery = {}): Promise<BalanceLedgerEntry[]> {
    const params: unknown[] = [];
    const where = query.user_id
      ? (() => {
          params.push(normalizeUserId(query.user_id));
          return "WHERE user_id = ?";
        })()
      : "";

    const rows = await rawAll<BalanceLedgerEntry>(this.resolveRaw(), [
      `SELECT entry_id, user_id, kind, amount, balance_after, note, ref, metadata_json, created_at FROM ${LEDGER_TABLE}`,
      where,
      "ORDER BY created_at DESC, rowid DESC",
      "LIMIT ?",
    ].join(" "), [...params, normalizeLimit(query.limit)]);
    return rows.map(parseLedgerRow);
  }

  /**
   * 列出充值单。
   */
  async listTopups(query: BalanceTopupQuery = {}): Promise<BalanceTopup[]> {
    const params: unknown[] = [];
    const where = query.user_id
      ? (() => {
          params.push(normalizeUserId(query.user_id));
          return "WHERE user_id = ?";
        })()
      : "";

    const rows = await rawAll<BalanceTopup>(this.resolveRaw(), [
      `SELECT topup_id, user_id, amount, status, note, ref, metadata_json, created_at, updated_at FROM ${TOPUP_TABLE}`,
      where,
      "ORDER BY created_at DESC",
      "LIMIT ?",
    ].join(" "), [...params, normalizeLimit(query.limit)]);
    return rows.map(parseTopupRow);
  }

  /**
   * 列出 redeem_code。
   */
  async listRedeemCodes(query: BalanceRedeemCodeQuery = {}): Promise<BalanceRedeemCode[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    const status = normalizeRedeemCodeStatus(query.status);

    if (query.user_id) {
      clauses.push("redeemed_by_user_id = ?");
      params.push(normalizeUserId(query.user_id));
    }

    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await rawAll<BalanceRedeemCode>(this.resolveRaw(), [
      `SELECT redeem_code_id, amount, status, code_mask, note, ref, metadata_json, redeemed_by_user_id, redeemed_at, created_at, updated_at FROM ${REDEEM_CODE_TABLE}`,
      where,
      "ORDER BY created_at DESC",
      "LIMIT ?",
    ].join(" "), [...params, normalizeLimit(query.limit)]);
    return rows.map(parseRedeemCodeRow);
  }

  /**
   * 关键说明（中文）
   * - 正数表示加款，负数表示扣款
   * - 扣款走 SQL 条件更新，避免把余额扣成负数
   * - 扣费策略本身不写在服务里，而是由业务 hook 调用本方法
   */
  private async applyDelta(
    user_id: string,
    delta: number,
    kind: BalanceLedgerKind,
    extra: BalanceExtra,
  ): Promise<BalanceAccount> {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new TypeError("delta must be a non-zero integer");
    }

    await this.ensureAccount(user_id);
    const now = new Date().toISOString();

    if (delta > 0) {
      await rawRun(this.resolveRaw(), [
        `UPDATE ${ACCOUNT_TABLE}`,
        "SET balance = balance + ?, updated_at = ?",
        "WHERE user_id = ?",
      ].join(" "), [delta, now, user_id]);
    } else {
      const spend = Math.abs(delta);
      const changed = await rawRun(this.resolveRaw(), [
        `UPDATE ${ACCOUNT_TABLE}`,
        "SET balance = balance - ?, updated_at = ?",
        "WHERE user_id = ? AND balance >= ?",
      ].join(" "), [spend, now, user_id, spend]);

      if (changed === 0) {
        const current = await this.readAccountRequired(user_id);
        throw httpError(402, `insufficient balance: need ${spend} microcredits, current ${current.balance} microcredits`);
      }
    }

    const account = await this.readAccountRequired(user_id);
    await this.insertLedger({
      entry_id: `bal_${randomId()}`,
      user_id,
      kind,
      amount: delta,
      balance_after: account.balance,
      note: normalizeText(extra.note),
      ref: normalizeText(extra.ref),
      metadata_json: stringifyMeta(extra.meta),
      created_at: now,
    });
    return account;
  }

  /**
   * 首次见到某用户时自动开户。
   */
  private async ensureAccount(user_id: string): Promise<void> {
    const now = new Date().toISOString();
    const inserted = await rawRun(this.resolveRaw(), [
      `INSERT OR IGNORE INTO ${ACCOUNT_TABLE} (user_id, balance, created_at, updated_at)`,
      "VALUES (?, ?, ?, ?)",
    ].join(" "), [user_id, this.initMicrocredits, now, now]);

    if (inserted > 0 && this.initMicrocredits > 0) {
      await this.insertLedger({
        entry_id: `bal_${randomId()}`,
        user_id,
        kind: "init",
        amount: this.initMicrocredits,
        balance_after: this.initMicrocredits,
        note: "initial balance",
        ref: "",
        metadata_json: "{}",
        created_at: now,
      });
    }
  }

  /**
   * 读取账户；不存在时报错。
   */
  private async readAccountRequired(user_id: string): Promise<BalanceAccount> {
    const row = await rawFirst<BalanceAccount>(this.resolveRaw(), [
      `SELECT user_id, balance, created_at, updated_at FROM ${ACCOUNT_TABLE}`,
      "WHERE user_id = ?",
    ].join(" "), [user_id]);

    if (!row) {
      throw httpError(404, `balance account not found for user ${user_id}`);
    }

    return parseAccountRow(row);
  }

  /**
   * 读取充值单；不存在时报错。
   */
  private async readTopupRequired(topup_id: string): Promise<BalanceTopup> {
    const row = await rawFirst<BalanceTopup>(this.resolveRaw(), [
      `SELECT topup_id, user_id, amount, status, note, ref, metadata_json, created_at, updated_at FROM ${TOPUP_TABLE}`,
      "WHERE topup_id = ?",
    ].join(" "), [readRequired(topup_id, "topup_id")]);

    if (!row) {
      throw httpError(404, `topup not found: ${topup_id}`);
    }

    return parseTopupRow(row);
  }

  /**
   * 按 ID 读取 redeem_code；不存在时报错。
   */
  private async readRedeemCodeRequired(redeem_code_id: string): Promise<BalanceRedeemCode> {
    const row = await rawFirst<BalanceRedeemCode>(this.resolveRaw(), [
      `SELECT redeem_code_id, amount, status, code_mask, note, ref, metadata_json, redeemed_by_user_id, redeemed_at, created_at, updated_at FROM ${REDEEM_CODE_TABLE}`,
      "WHERE redeem_code_id = ?",
    ].join(" "), [readRequired(redeem_code_id, "redeem_code_id")]);

    if (!row) {
      throw httpError(404, `redeem_code not found: ${redeem_code_id}`);
    }

    return parseRedeemCodeRow(row);
  }

  /**
   * 按哈希读取 redeem_code；不存在时返回空。
   */
  private async readRedeemCodeByHash(codeHash: string): Promise<StoredRedeemCodeRow | undefined> {
    const row = await rawFirst<StoredRedeemCodeRow>(this.resolveRaw(), [
      `SELECT redeem_code_id, code_hash, amount, status, code_mask, note, ref, metadata_json, redeemed_by_user_id, redeemed_at, created_at, updated_at FROM ${REDEEM_CODE_TABLE}`,
      "WHERE code_hash = ?",
    ].join(" "), [readRequired(codeHash, "code_hash")]);

    return row
      ? {
          ...parseRedeemCodeRow(row),
          code_hash: String(row.code_hash),
        }
      : undefined;
  }

  /**
   * 写入流水。
   */
  private async insertLedger(entry: BalanceLedgerEntry): Promise<void> {
    await rawRun(this.resolveRaw(), [
      `INSERT INTO ${LEDGER_TABLE} (entry_id, user_id, kind, amount, balance_after, note, ref, metadata_json, created_at)`,
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join(" "), [
      entry.entry_id,
      entry.user_id,
      entry.kind,
      entry.amount,
      entry.balance_after,
      entry.note,
      entry.ref,
      entry.metadata_json,
      entry.created_at,
    ]);
  }

  /**
   * 拿到底层原始数据库对象。
   */
  private resolveRaw(): unknown {
    if (!this._raw) {
      throw new Error("balance service raw database is not ready");
    }
    return this._raw;
  }
}

/**
 * 创建 Balance 服务实例。
 */
export function balanceService(options: BalanceServiceOptions = {}): BalanceService {
  return new BalanceService(options);
}
