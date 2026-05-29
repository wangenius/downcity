/**
 * Payment 用户端调用器。
 *
 * 关键说明（中文）
 * - `client.payment.methods()` 统一读取支付方式目录
 * - `client.payment.method("stripe").invoke(...)` 会自动解析目标 service / action
 * - 前端不再手写 `payment.stripe` 或 `checkout/create`
 */

import type { RequestInitLike } from "../../http.js";
import { ServiceClient } from "../invoker.js";
import type { UserPaymentMethod } from "./types.js";

const PREFIX = "/v1/payment";

type Requester = <T>(path: string, init: RequestInitLike) => Promise<T>;
type ServiceFactory = (name: string) => ServiceClient;

/**
 * Payment 调用器。
 */
export class PaymentInvoker {
  private readonly req: Requester;
  private readonly service: ServiceFactory;
  private readonly hasUserToken: () => boolean;

  constructor(opts: {
    requestJSON: Requester;
    service: ServiceFactory;
    hasUserToken: () => boolean;
  }) {
    this.req = opts.requestJSON;
    this.service = opts.service;
    this.hasUserToken = opts.hasUserToken;
  }

  /**
   * 读取当前 InfraRuntime 暴露的支付方式列表。
   */
  async methods(): Promise<UserPaymentMethod[]> {
    const body = await this.req<{ items: UserPaymentMethod[] }>(`${PREFIX}/methods`, {
      method: "GET",
    });
    return body.items;
  }

  /**
   * 获取单个支付方式句柄。
   */
  method(id: string): PaymentMethodHandle {
    return new PaymentMethodHandle(this, normalizeMethodId(id));
  }

  /**
   * 读取单个支付方式定义。
   */
  async readMethod(id: string): Promise<UserPaymentMethod> {
    const methodId = normalizeMethodId(id);
    const methods = await this.methods();
    const method = methods.find((item) => item.id === methodId);
    if (!method) {
      throw new Error(`payment method "${methodId}" is not available`);
    }
    return method;
  }

  /**
   * 按支付方式定义自动分发到具体 service / action。
   */
  async invokeMethod<T = unknown>(
    id: string,
    input: Record<string, unknown> = {},
  ): Promise<T> {
    const method = await this.readMethod(id);
    return this.executeMethod(method, input);
  }

  /**
   * 使用已解析的支付方式定义执行具体动作。
   */
  executeMethod<T = unknown>(
    method: UserPaymentMethod,
    input: Record<string, unknown> = {},
  ): Promise<T> {
    return this.dispatchMethod(method, input);
  }

  private dispatchMethod<T = unknown>(
    method: UserPaymentMethod,
    input: Record<string, unknown> = {},
  ): Promise<T> {
    if (!method.enabled) {
      const reason = method.reason ? `: ${method.reason}` : "";
      throw new Error(`payment method "${method.id}" is disabled${reason}`);
    }

    if (method.requires_user && !this.hasUserToken()) {
      throw new TypeError(`user_token is required for payment method "${method.id}"`);
    }

    return this.service(method.service).action(method.action).invoke<T>(input);
  }
}

/**
 * 单个支付方式句柄。
 */
export class PaymentMethodHandle {
  /**
   * 支付方式唯一标识。
   */
  readonly id: string;

  private definitionPromise?: Promise<UserPaymentMethod>;

  constructor(
    private readonly payment: PaymentInvoker,
    id: string,
  ) {
    this.id = id;
  }

  /**
   * 读取当前支付方式定义。
   */
  describe(): Promise<UserPaymentMethod> {
    if (!this.definitionPromise) {
      this.definitionPromise = this.payment.readMethod(this.id);
    }
    return this.definitionPromise;
  }

  /**
   * 发起当前支付方式对应的具体动作。
   */
  async invoke<T = unknown>(input: Record<string, unknown> = {}): Promise<T> {
    const method = await this.describe();
    return this.payment.executeMethod<T>(method, input);
  }
}

function normalizeMethodId(value: string): string {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError("payment method id is required");
  return id;
}
