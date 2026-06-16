/**
 * Towns Service 调用器（对应 core service/towns/towns-service.ts TownsService）。
 *
 * 管理端操作：Town CRUD + Token 签发。
 */

import type { RequestInitLike } from "../../http.ts";
import type { Town, TownCreateInput, TokenApplyInput, TokenApplyResult } from "./types.ts";

const PREFIX = "/v1/towns";

/**
 * Town 和 Token 管理调用器。
 *
 * 通过 Admin City .towns 访问：
 * ```ts
 * await admin.towns.list();
 * await admin.towns.create({ name: "My App" });
 * await admin.towns.tokens.apply({ town_id, user_id });
 * ```
 */
export class TownsInvoker {
  /** Token 签发 */
  readonly tokens: TokenInvoker;

  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;

  constructor(opts: {
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
  }) {
    this.req = opts.requestJSON;
    this.tokens = new TokenInvoker(opts);
  }

  /** 列出 Town */
  async list(): Promise<Town[]> {
    const body = await this.req<{ items: Town[] }>(`${PREFIX}/list`, { method: "GET" });
    return body.items;
  }

  /** 创建 */
  create(input: TownCreateInput): Promise<Town> {
    return this.req(`${PREFIX}/create`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** 暂停 */
  pause(town_id: string): Promise<Town> {
    return this.req(`${PREFIX}/pause`, {
      method: "POST",
      body: JSON.stringify({ town_id }),
    });
  }

  /** 激活 */
  activate(town_id: string): Promise<Town> {
    return this.req(`${PREFIX}/activate`, {
      method: "POST",
      body: JSON.stringify({ town_id }),
    });
  }

  /** 删除 */
  remove(town_id: string): Promise<unknown> {
    return this.req(`${PREFIX}/remove`, {
      method: "POST",
      body: JSON.stringify({ town_id }),
    });
  }
}

/** Token 签发调用器 */
class TokenInvoker {
  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;

  constructor(opts: {
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
  }) {
    this.req = opts.requestJSON;
  }

  /** 签发 user_token */
  apply(input: TokenApplyInput): Promise<TokenApplyResult> {
    return this.req(`${PREFIX}/tokens/apply`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
