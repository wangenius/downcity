/**
 * 终端用户 SDK。
 */

import { AIInvoker, serializeModel } from "../invoker/ai/index.js";
import { PaymentInvoker } from "../invoker/payment/index.js";
import { ServiceClient } from "../invoker/invoker.js";
import type { UserCityAccessOptions, UserServiceInput, UserServiceSummary } from "./types.js";
import {
  defaultFetch,
  normalizeBaseURL,
  requestJSON,
  requestRaw,
  requiredString,
  type FetchLike,
  type RequestInitLike,
} from "../http.js";

export class UserCityAccess {
  readonly ai: AIInvoker;
  readonly payment: PaymentInvoker;

  readonly serverUrl: string;
  readonly token: string | undefined;

  private readonly town_id?: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: UserCityAccessOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("User City options are required");
    }

    this.serverUrl = normalizeBaseURL(options.base_url, "base_url");
    this.token = readOptional(options.user_token);
    this.town_id = readOptional(options.town_id);
    this.fetchImpl = options.fetch ?? defaultFetch();

    this.ai = new AIInvoker({
      baseUrl: this.serverUrl,
      token: this.token,
      requestJSON: (path, init) => this.json(path, init),
      requestRaw: (path, init) => this.raw(path, init),
      buildInput: (input) => this.buildInput(input),
    });
    this.payment = new PaymentInvoker({
      requestJSON: (path, init) => this.json(path, init),
      service: (name) => this.service(name),
      hasUserToken: () => Boolean(this.token),
    });
  }

  // ===================================================================
  // Service → Action 调用
  // ===================================================================

  /** 获取 Service 调用器 */
  service(name: string): ServiceClient {
    const id = String(name ?? "").trim();
    if (!id) throw new TypeError("service name is required");
    return new ServiceClient(
      (path, init) => this.json(path, init),
      "/v1",
      id,
      this.town_id,
    );
  }

  /** 列出已注册的 service 摘要 */
  async listServices(): Promise<UserServiceSummary[]> {
    return this.json<{ items: UserServiceSummary[] }>("/v1/services", { method: "GET" })
      .then((body) => body.items);
  }

  // ===================================================================
  // 内部
  // ===================================================================

  private json<T>(path: string, init: RequestInitLike): Promise<T> {
    return requestJSON<T>({
      fetch: this.fetchImpl,
      url: `${this.serverUrl}${path}`,
      init: this.withAuth(init),
    });
  }

  private raw(path: string, init: RequestInitLike) {
    this.requireToken();
    return requestRaw({
      fetch: this.fetchImpl,
      url: `${this.serverUrl}${path}`,
      init: this.withAuth(init),
    });
  }

  private withAuth(init: RequestInitLike): RequestInitLike {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...init.headers,
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    return { ...init, headers };
  }

  private buildInput(input: UserServiceInput): Record<string, unknown> {
    return {
      ...input,
      model: serializeModel(input.model),
      town_id: this.require_town_id(),
    };
  }

  private require_town_id(): string {
    if (!this.town_id) throw new TypeError("town_id is required for AI calls");
    return this.town_id;
  }

  private requireToken(): void {
    if (!this.token) throw new TypeError("user_token is required for this operation");
  }
}

function readOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, "option");
}
