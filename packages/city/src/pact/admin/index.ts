/**
 * 管理端 SDK。
 */

import { ServiceClient } from "../invoker/invoker.js";
import { BalanceInvoker } from "../invoker/balance/index.js";
import { EnvInvoker } from "../invoker/env/index.js";
import { CitiesInvoker } from "../invoker/cities/index.js";
import {
  defaultFetch,
  normalizeBaseURL,
  requestJSON,
  requestText,
  requiredString,
  type FetchLike,
  type RequestInitLike,
} from "../http.js";
import type {
  AdminPactAccessOptions,
  AdminModelRecord,
  AdminServiceSummary,
} from "./types.js";

export class AdminPactAccess {
  readonly balance: BalanceInvoker;
  readonly env: EnvInvoker;
  readonly cities: CitiesInvoker;

  private readonly base_url: string;
  private readonly secret: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: AdminPactAccessOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("Admin CityPact options are required");
    }

    this.base_url = normalizeBaseURL(options.base_url, "base_url");
    this.secret = requiredString(
      options.admin_secret_key ?? process.env.DOWNCITY_FEDERATION_ADMIN_SECRET_KEY,
      "admin_secret_key",
    );
    this.fetchImpl = options.fetch ?? defaultFetch();

    const req = <T>(path: string, init: RequestInitLike) => this.json<T>(path, init);
    this.balance = new BalanceInvoker({ requestJSON: req });
    this.env = new EnvInvoker({ requestJSON: req });
    this.cities = new CitiesInvoker({ requestJSON: req });
  }

  /** 获取 Service 调用器（与 User CityPact 共用同一路由） */
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
    return requestJSON<T>({
      fetch: this.fetchImpl,
      url: `${this.base_url}${path}`,
      init: this.withAuth(init),
    });
  }

  private text(path: string, init: RequestInitLike): Promise<string> {
    return requestText({
      fetch: this.fetchImpl,
      url: `${this.base_url}${path}`,
      init: this.withAuth(init),
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
