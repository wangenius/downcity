/**
 * Federation 全局控制面客户端。
 *
 * 该客户端承载 env、City、余额、模型和 Service 管理能力，不参与终端用户
 * 或 Bureau 产品后端的请求链路。
 */

import { AdminPactAccess } from "../pact/admin/index.js";
import type { ServiceClient } from "../pact/invoker/invoker.js";
import type { AdminModelRecord, AdminServiceSummary } from "../pact/admin/types.js";
import type { FederationAdminOptions } from "../types/FederationAdmin.js";

/** Federation 全局控制面客户端。 */
export class FederationAdmin {
  private readonly admin_access: AdminPactAccess;

  constructor(options: FederationAdminOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("FederationAdmin options are required");
    }
    this.admin_access = new AdminPactAccess({
      base_url: options.federation_url,
      admin_secret_key: options.admin_secret_key,
      fetch: options.fetch,
    });
  }

  /** Federation 余额管理入口。 */
  get balance(): AdminPactAccess["balance"] {
    return this.admin_access.balance;
  }

  /** Federation City 管理入口。 */
  get cities(): AdminPactAccess["cities"] {
    return this.admin_access.cities;
  }

  /** Federation Bureau 注册表管理入口。 */
  get bureaus(): AdminPactAccess["bureaus"] {
    return this.admin_access.bureaus;
  }

  /** Federation 环境变量管理入口。 */
  get env(): AdminPactAccess["env"] {
    return this.admin_access.env;
  }

  /** 获取管理身份下的 Service 调用器。 */
  service(name: string): ServiceClient {
    return this.admin_access.service(name);
  }

  /** 列出 Federation 暴露的 Service。 */
  listServices(): Promise<AdminServiceSummary[]> {
    return this.admin_access.listServices();
  }

  /** 列出 Federation 模型目录及管理状态。 */
  listModels(): Promise<AdminModelRecord[]> {
    return this.admin_access.listModels();
  }

  /** 读取 Federation 聚合说明文档。 */
  instruction(): Promise<string> {
    return this.admin_access.instruction();
  }
}
