/**
 * Balance Service 管理端调用器。
 *
 * 路由：/v1/balance/*
 */

import type { RequestInitLike } from "../../http.ts";
import type {
  BalanceAccountRecord,
  BalanceHistoryListInput,
  BalanceLedgerRecord,
  BalanceMutationInput,
  BalanceRedeemCodeCreateInput,
  BalanceRedeemCodeDisableInput,
  BalanceRedeemCodeIssueResult,
  BalanceRedeemCodeListInput,
  BalanceRedeemCodeRecord,
  BalanceTopupListInput,
  BalanceTopupRecord,
  BalanceTopupUpdateInput,
} from "./types.ts";

const PREFIX = "/v1/balance";

/**
 * Balance 管理端调用器。
 *
 * 通过 `admin.balance` 访问：
 * ```ts
 * await admin.balance.listUsers();
 * const issued = await admin.balance.redeemCodes.create({ amount: 500 });
 * ```
 */
export class BalanceInvoker {
  /**
   * redeem_code 子调用器。
   */
  readonly redeemCodes: BalanceRedeemCodeInvoker;

  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;

  constructor(opts: {
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
  }) {
    this.req = opts.requestJSON;
    this.redeemCodes = new BalanceRedeemCodeInvoker(opts);
  }

  /**
   * 列出余额账户。
   */
  async listUsers(limit?: string | number): Promise<BalanceAccountRecord[]> {
    const body = await this.req<{ items: BalanceAccountRecord[] }>(
      withQuery(`${PREFIX}/users`, { limit }),
      { method: "GET" },
    );
    return body.items;
  }

  /**
   * 列出余额流水。
   */
  async listHistory(input: BalanceHistoryListInput = {}): Promise<BalanceLedgerRecord[]> {
    const body = await this.req<{ items: BalanceLedgerRecord[] }>(
      withQuery(`${PREFIX}/history`, input),
      { method: "GET" },
    );
    return body.items;
  }

  /**
   * 列出充值单。
   */
  async listTopups(input: BalanceTopupListInput = {}): Promise<BalanceTopupRecord[]> {
    const body = await this.req<{ items: BalanceTopupRecord[] }>(
      withQuery(`${PREFIX}/topups`, input),
      { method: "GET" },
    );
    return body.items;
  }

  /**
   * 手动加余额。
   */
  add(input: BalanceMutationInput): Promise<BalanceAccountRecord> {
    return this.req(`${PREFIX}/add`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * 手动扣余额。
   */
  sub(input: BalanceMutationInput): Promise<BalanceAccountRecord> {
    return this.req(`${PREFIX}/sub`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * 确认充值单到账。
   */
  finishTopup(input: BalanceTopupUpdateInput): Promise<BalanceTopupRecord> {
    return this.req(`${PREFIX}/topups/finish`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * 取消充值单。
   */
  cancelTopup(input: BalanceTopupUpdateInput): Promise<BalanceTopupRecord> {
    return this.req(`${PREFIX}/topups/cancel`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}

/**
 * redeem_code 管理端调用器。
 */
export class BalanceRedeemCodeInvoker {
  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;

  constructor(opts: {
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
  }) {
    this.req = opts.requestJSON;
  }

  /**
   * 列出 redeem_code。
   */
  async list(input: BalanceRedeemCodeListInput = {}): Promise<BalanceRedeemCodeRecord[]> {
    const body = await this.req<{ items: BalanceRedeemCodeRecord[] }>(
      withQuery(`${PREFIX}/redeem-codes`, input),
      { method: "GET" },
    );
    return body.items;
  }

  /**
   * 创建 redeem_code。
   */
  create(input: BalanceRedeemCodeCreateInput): Promise<BalanceRedeemCodeIssueResult> {
    return this.req(`${PREFIX}/redeem-codes/create`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * 停用 redeem_code。
   */
  disable(input: BalanceRedeemCodeDisableInput): Promise<BalanceRedeemCodeRecord> {
    return this.req(`${PREFIX}/redeem-codes/disable`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}

/**
 * 构造带 query 的 URL。
 *
 * 关键说明（中文）
 * - SDK 统一处理 query 拼接，避免调用方手写 URL
 * - 空值会被自动忽略
 */
function withQuery(url: string, query?: object): string {
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}
