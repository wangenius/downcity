/**
 * Products Service 调用器（对应 core service/products/products-service.ts ProductsService）。
 *
 * 管理端操作：Product CRUD + Token 签发。
 */

import type { RequestInitLike } from "../../http.js";
import type { Product, ProductCreateInput, TokenApplyInput, TokenApplyResult } from "./types.js";

const PREFIX = "/v1/products";

/**
 * Product 和 Token 管理调用器。
 *
 * 通过 AdminClient.products 访问：
 * ```ts
 * await admin.products.list();
 * await admin.products.create({ name: "My App" });
 * await admin.products.tokens.apply({ product_id, user_id });
 * ```
 */
export class ProductsInvoker {
  /** Token 签发 */
  readonly tokens: TokenInvoker;

  private readonly req: <T>(path: string, init: RequestInitLike) => Promise<T>;

  constructor(opts: {
    requestJSON: <T>(path: string, init: RequestInitLike) => Promise<T>;
  }) {
    this.req = opts.requestJSON;
    this.tokens = new TokenInvoker(opts);
  }

  /** 列出 Product */
  async list(): Promise<Product[]> {
    const body = await this.req<{ items: Product[] }>(`${PREFIX}/list`, { method: "GET" });
    return body.items;
  }

  /** 创建 */
  create(input: ProductCreateInput): Promise<Product> {
    return this.req(`${PREFIX}/create`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** 暂停 */
  pause(product_id: string): Promise<Product> {
    return this.req(`${PREFIX}/pause`, {
      method: "POST",
      body: JSON.stringify({ product_id }),
    });
  }

  /** 激活 */
  activate(product_id: string): Promise<Product> {
    return this.req(`${PREFIX}/activate`, {
      method: "POST",
      body: JSON.stringify({ product_id }),
    });
  }

  /** 删除 */
  remove(product_id: string): Promise<unknown> {
    return this.req(`${PREFIX}/remove`, {
      method: "POST",
      body: JSON.stringify({ product_id }),
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
