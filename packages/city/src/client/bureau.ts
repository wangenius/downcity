/**
 * Bureau 产品后端与 Federation 管理客户端。
 *
 * Bureau 必须携带 bureau_token。identify() 始终在线请求 Federation，管理能力
 * 复用同一 Bureau Token，并由 Federation 根据 capability 决定是否允许。
 */

import { AdminPactAccess } from "../pact/admin/index.js";
import type { ServiceClient } from "../pact/invoker/invoker.js";
import type { BureausInvoker } from "../pact/invoker/bureaus/index.js";
import type { AdminModelRecord, AdminServiceSummary } from "../pact/admin/types.js";
import type { BureauIdentity, BureauOptions } from "../types/Bureau.js";

/** Federation Bureau 客户端。 */
export class Bureau {
  private readonly access: AdminPactAccess;

  constructor(options: BureauOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("Bureau options are required");
    }
    this.access = new AdminPactAccess({
      base_url: options.federation_url,
      bureau_token: options.bureau_token,
      fetch: options.fetch,
    });
  }

  /** 在线识别请求中的 Federation 用户。 */
  identify(request: Request): Promise<BureauIdentity> {
    const user_token = read_bearer_token(request);
    return this.access.service("accounts").action("identify").invoke({ user_token });
  }

  /** Federation 余额管理入口。 */
  get balance(): AdminPactAccess["balance"] {
    return this.access.balance;
  }

  /** Federation City 管理入口。 */
  get cities(): AdminPactAccess["cities"] {
    return this.access.cities;
  }

  /** Federation 环境变量管理入口。 */
  get env(): AdminPactAccess["env"] {
    return this.access.env;
  }

  /** Bureau Token 管理入口。 */
  get bureaus(): BureausInvoker {
    return this.access.bureaus;
  }

  /** 获取 Bureau 身份下的 Service 调用器。 */
  service(name: string): ServiceClient {
    return this.access.service(name);
  }

  /** 列出 Federation 暴露的 Service。 */
  listServices(): Promise<AdminServiceSummary[]> {
    return this.access.listServices();
  }

  /** 列出 Federation 模型目录。 */
  listModels(): Promise<AdminModelRecord[]> {
    return this.access.listModels();
  }

  /** 读取 Federation 聚合说明文档。 */
  instruction(): Promise<string> {
    return this.access.instruction();
  }
}

function read_bearer_token(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw new TypeError("User bearer token is required");
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new TypeError("User bearer token is required");
  return token;
}
