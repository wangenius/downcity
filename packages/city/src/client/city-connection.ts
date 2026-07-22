/**
 * City 到 Bureau 独立服务的连接客户端。
 *
 * City 不依赖 Bureau SDK，也不参与 Bureau 的管理面。连接只复用当前 City
 * 的 user_token，把请求发送到指定 Bureau 服务端，并由 Bureau 自行完成
 * user_token 验签与业务授权。
 */

import { UserPactAccess } from "../pact/user/index.js";
import type { ServiceClient } from "../pact/invoker/invoker.js";
import type { UserServiceSummary } from "../pact/user/types.js";
import type { FetchLike } from "../pact/http.js";

/** City 连接 Bureau 独立服务的客户端。 */
export class CityConnection {
  private readonly user_access: UserPactAccess;

  constructor(options: {
    /** Bureau 独立服务的 HTTP 入口地址。 */
    bureau_url: string;
    /** City 当前 Federation user_token，可省略以访问公开服务。 */
    user_token?: string;
    /** 自定义 fetch 实现。 */
    fetch?: FetchLike;
  }) {
    this.user_access = new UserPactAccess({
      base_url: options.bureau_url,
      user_token: options.user_token,
      fetch: options.fetch,
    });
  }

  /** 获取 Bureau 暴露的独立 Service 调用器。 */
  service(name: string): ServiceClient {
    return this.user_access.service(name);
  }

  /** 列出 Bureau 暴露的独立 Service。 */
  listServices(): Promise<UserServiceSummary[]> {
    return this.user_access.listServices();
  }
}
