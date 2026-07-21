/**
 * City 终端用户客户端。
 *
 * City 只持有 Federation 地址与可选 user_token。city_id 由 Federation 在服务端
 * 验签后从 token 中读取，客户端不能重复声明或覆盖。
 */

import { UserPactAccess } from "../pact/user/index.js";
import type { ServiceClient } from "../pact/invoker/invoker.js";
import type { CityOptions } from "./types.js";
import type { UserServiceSummary } from "../pact/user/types.js";

/** Downcity City 用户客户端。 */
export class City {
  private readonly user_access: UserPactAccess;

  constructor(options: CityOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("City options are required");
    }
    this.user_access = new UserPactAccess({
      base_url: options.federation_url,
      user_token: options.user_token,
      fetch: options.fetch,
    });
  }

  /** 用户侧 AI 调用入口。 */
  get ai(): UserPactAccess["ai"] {
    return this.user_access.ai;
  }

  /** 用户侧支付入口。 */
  get payment(): UserPactAccess["payment"] {
    return this.user_access.payment;
  }

  /** Federation 当前用户数据入口。 */
  user(): UserPactAccess["user"] {
    return this.user_access.user;
  }

  /** 获取普通 Service 调用器。 */
  service(name: string): ServiceClient {
    return this.user_access.service(name);
  }

  /** 列出 Federation 暴露的 Service。 */
  listServices(): Promise<UserServiceSummary[]> {
    return this.user_access.listServices();
  }
}
