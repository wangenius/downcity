/**
 * Bays Service 调用器（对应 core service/bays/bays-service.ts BaysService）。
 *
 * 管理端操作：Bay CRUD + Token 签发。
 */

import type { RequestInitLike } from "../../http.js";
import type { Bay, BayCreateInput, TokenApplyInput, TokenApplyResult } from "./types.js";

const PREFIX = "/v1/bays";

/**
 * Bay 和 Token 管理调用器。
 *
 * 通过 Admin Gate .bays 访问：
 * ```ts
 * await admin.bays.list();
 * await admin.bays.create({ name: "My App" });
 * await admin.bays.tokens.apply({ bay_id, user_id });
 * ```
 */
export class BaysInvoker {
  /** Token 签发 */
  readonly tokens: TokenInvoker;

  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;

  constructor(opts: {
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
  }) {
    this.req = opts.requestJSON;
    this.tokens = new TokenInvoker(opts);
  }

  /** 列出 Bay */
  async list(): Promise<Bay[]> {
    const body = await this.req<{ items: Bay[] }>(`${PREFIX}/list`, { method: "GET" });
    return body.items;
  }

  /** 创建 */
  create(input: BayCreateInput): Promise<Bay> {
    return this.req(`${PREFIX}/create`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** 暂停 */
  pause(bay_id: string): Promise<Bay> {
    return this.req(`${PREFIX}/pause`, {
      method: "POST",
      body: JSON.stringify({ bay_id }),
    });
  }

  /** 激活 */
  activate(bay_id: string): Promise<Bay> {
    return this.req(`${PREFIX}/activate`, {
      method: "POST",
      body: JSON.stringify({ bay_id }),
    });
  }

  /** 删除 */
  remove(bay_id: string): Promise<unknown> {
    return this.req(`${PREFIX}/remove`, {
      method: "POST",
      body: JSON.stringify({ bay_id }),
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
