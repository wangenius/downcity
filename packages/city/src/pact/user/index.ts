/**
 * 终端用户 SDK。
 */

import { AIInvoker, serializeModel } from "../invoker/ai/index.js";
import { PaymentInvoker } from "../invoker/payment/index.js";
import { ServiceClient } from "../invoker/invoker.js";
import type { UserPactAccessOptions, UserServiceInput, UserServiceSummary } from "./types.js";
import {
  defaultFetch,
  normalizeBaseURL,
  requestJSON,
  requestRaw,
  requiredString,
  type FetchLike,
  type RequestInitLike,
} from "../http.js";

export class UserPactAccess {
  readonly ai: AIInvoker;
  readonly payment: PaymentInvoker;

  readonly serverUrl: string;
  readonly token: string | undefined;

  private readonly city_id?: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: UserPactAccessOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("User City options are required");
    }

    this.serverUrl = normalizeBaseURL(options.base_url, "base_url");
    this.token = readOptional(options.user_token);
    this.city_id = readOptional(options.city_id);
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
      this.city_id,
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
      city_id: this.require_city_id(),
    };
  }

  private require_city_id(): string {
    if (!this.city_id) throw new TypeError("city_id is required for AI calls");
    return this.city_id;
  }

  private requireToken(): void {
    if (!this.token) throw new TypeError("user_token is required for this operation");
  }
}

function readOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, "option");
}
