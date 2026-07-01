/**
 * 管理端 SDK。
 */

import { ServiceClient } from "../invoker/invoker.js";
import { BalanceInvoker } from "../invoker/balance/index.js";
import { EnvInvoker } from "../invoker/env/index.js";
import { CitiesInvoker } from "../invoker/cities/index.js";
import {
  requiredString,
  type RequestInitLike,
} from "../http.js";
import {
  create_http_requester,
  create_rpc_requester,
  is_rpc_url,
  type CityRequester,
} from "../requester.js";
import type {
  AdminPactAccessOptions,
  AdminModelRecord,
  AdminServiceSummary,
} from "./types.js";

export class AdminPactAccess {
  readonly balance: BalanceInvoker;
  readonly cities: CitiesInvoker;
  readonly env: EnvInvoker;

  private readonly base_url: string;
  readonly city_id: string;
  private readonly secret: string | undefined;
  private readonly requester: CityRequester;

  constructor(options: AdminPactAccessOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("Admin City options are required");
    }

    this.base_url = requiredString(options.base_url, "base_url").replace(/\/+$/, "");
    this.city_id = requiredString(options.city_id, "city_id");
    this.secret = is_rpc_url(this.base_url)
      ? undefined
      : requiredString(
          options.admin_secret_key ?? process.env.DOWNCITY_FEDERATION_ADMIN_SECRET_KEY,
          "admin_secret_key",
        );
    this.requester = is_rpc_url(this.base_url)
      ? create_rpc_requester({
          base_url: this.base_url,
          identity: { role: "admin" },
        })
      : create_http_requester({
          base_url: this.base_url,
          fetch: options.fetch,
          with_auth: (init) => this.withAuth(init),
        });

    const req = <T>(path: string, init: RequestInitLike) => this.json<T>(path, init);
    this.balance = new BalanceInvoker({ requestJSON: req });
    this.cities = new CitiesInvoker({ requestJSON: req });
    this.env = new EnvInvoker({ requestJSON: req });
  }

  /** 获取 Service 调用器（与 User City 共用同一路由） */
  service(name: string): ServiceClient {
    const id = String(name ?? "").trim();
    if (!id) throw new TypeError("service name is required");
    return new ServiceClient(
      (path, init) => this.json(path, init),
      "/v1",
      id,
    );
  }

  /** 列出当前 Federation 暴露的 service 摘要。 */
  async listServices(): Promise<AdminServiceSummary[]> {
    const body = await this.json<{ items: AdminServiceSummary[] }>("/v1/services", {
      method: "GET",
    });
    return body.items;
  }

  /** 列出当前 Federation 注册的模型目录（admin 身份可见额外状态字段）。 */
  async listModels(): Promise<AdminModelRecord[]> {
    const body = await this.json<{ items: AdminModelRecord[] }>("/v1/ai/models", {
      method: "GET",
    });
    return body.items;
  }

  /** 读取 City 聚合后的说明文档。 */
  async instruction(): Promise<string> {
    return this.text("/v1/federation/instruction", { method: "GET" });
  }

  private json<T>(path: string, init: RequestInitLike): Promise<T> {
    return this.requester.json<T>(path, init);
  }

  private text(path: string, init: RequestInitLike): Promise<string> {
    return this.requester.text(path, init);
  }


  /**
   * 为当前 City 签发 user token。
   *
   * 不需要传 city_id，构造时传入的 city_id 会自动注入。
   */
  async applyToken(input: {
    user_id: string;
    metadata?: Record<string, unknown>;
    ttl?: string | number;
  }): Promise<{ user_token: string; city_id: string; user_id: string; expires_at?: string }> {
    return this.json('/v1/cities/tokens/apply', {
      method: 'POST',
      body: JSON.stringify({ ...input, city_id: this.city_id }),
    });
  }

  /**
   * 为管理端请求统一补齐鉴权头。
   *
   * 关键说明（中文）
   * - 所有管理端请求都必须带上 admin bearer token
   * - 默认仍然补 `content-type: application/json`，便于 POST action 统一行为
   */
  private withAuth(init: RequestInitLike): RequestInitLike {
    if (!this.secret) return init;
    return {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.secret}`,
        ...init.headers,
      },
    };
  }
}
