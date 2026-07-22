/**
 * Federation 控制面 HTTP 访问层。
 *
 * 统一使用 admin_secret_key 调用 Federation 管理接口。
 */

import { ServiceClient } from "../invoker/invoker.js";
import { BalanceInvoker } from "../invoker/balance/index.js";
import { EnvInvoker } from "../invoker/env/index.js";
import { CitiesInvoker } from "../invoker/cities/index.js";
import { BureausInvoker } from "../invoker/bureaus/index.js";
import {
  requiredString,
  type RequestInitLike,
} from "../http.js";
import {
  create_http_requester,
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
  readonly bureaus: BureausInvoker;
  readonly env: EnvInvoker;

  private readonly base_url: string;
  private readonly secret: string | undefined;
  private readonly requester: CityRequester;

  constructor(options: AdminPactAccessOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("Federation admin options are required");
    }

    this.base_url = requiredString(options.base_url, "base_url").replace(/\/+$/, "");
    this.secret = requiredString(options.admin_secret_key, "admin_secret_key");
    this.requester = create_http_requester({
      base_url: this.base_url,
      fetch: options.fetch,
      with_auth: (init) => this.withAuth(init),
    });

    const req = <T>(path: string, init: RequestInitLike) => this.json<T>(path, init);
    this.balance = new BalanceInvoker({ requestJSON: req });
    this.cities = new CitiesInvoker({ requestJSON: req });
    this.bureaus = new BureausInvoker({ requestJSON: req });
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
   * 为 Federation 管理请求统一补齐鉴权头。
   *
   * 关键说明（中文）
   * - 所有控制面请求都必须带上 admin_secret_key
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
