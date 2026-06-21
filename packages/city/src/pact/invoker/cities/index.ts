/**
 * Cities Service 调用器（对应 service/cities/cities-service.ts CitiesService）。
 *
 * 管理端操作：City CRUD + Token 签发。
 */

import type { RequestInitLike } from "../../http.js";
import type { CityRecord, CityCreateInput, TokenApplyInput, TokenApplyResult } from "./types.js";

const PREFIX = "/v1/cities";

/**
 * City 和 Token 管理调用器。
 *
 * 通过 Admin City .cities 访问：
 * ```ts
 * await admin.cities.list();
 * await admin.cities.create({ name: "My App" });
 * await admin.cities.tokens.apply({ city_id, user_id });
 * ```
 */
export class CitiesInvoker {
  /** Token 签发 */
  readonly tokens: TokenInvoker;

  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;

  constructor(opts: {
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
  }) {
    this.req = opts.requestJSON;
    this.tokens = new TokenInvoker(opts);
  }

  /** 列出 City */
  async list(): Promise<CityRecord[]> {
    const body = await this.req<{ items: CityRecord[] }>(`${PREFIX}/list`, { method: "GET" });
    return body.items;
  }

  /** 创建 */
  create(input: CityCreateInput): Promise<CityRecord> {
    return this.req(`${PREFIX}/create`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** 暂停 */
  pause(city_id: string): Promise<CityRecord> {
    return this.req(`${PREFIX}/pause`, {
      method: "POST",
      body: JSON.stringify({ city_id }),
    });
  }

  /** 激活 */
  activate(city_id: string): Promise<CityRecord> {
    return this.req(`${PREFIX}/activate`, {
      method: "POST",
      body: JSON.stringify({ city_id }),
    });
  }

  /** 删除 */
  remove(city_id: string): Promise<unknown> {
    return this.req(`${PREFIX}/remove`, {
      method: "POST",
      body: JSON.stringify({ city_id }),
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
