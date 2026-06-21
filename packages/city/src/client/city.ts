/**
 * City 客户端统一访问入口。
 *
 * City 面向开发者表达“我以某种角色进入 Federation”，内部再委托给
 * admin / user 协议访问层（`pact/`），让用户在第一层概念上无需关心 client 拆分。
 */

import { AdminPactAccess } from "../pact/admin/index.js";
import { UserPactAccess } from "../pact/user/index.js";
import type { ServiceClient } from "../pact/invoker/invoker.js";
import type { CityOptionsForRole, CityRole } from "./types.js";
import type { AdminModelRecord, AdminServiceSummary } from "../pact/admin/types.js";
import type { UserServiceSummary } from "../pact/user/types.js";

/**
 * Downcity City 客户端。
 */
export class City<TRole extends CityRole = CityRole> {
  /**
   * 当前 City 客户端的访问角色。
   */
  readonly role: TRole;

  /**
   * Admin 能力面。
   *
   * 仅 `role: "admin"` 时可用。
   */
  private readonly admin_access?: AdminPactAccess;

  /**
   * User 能力面。
   *
   * 仅 `role: "user"` 时可用。
   */
  private readonly user_access?: UserPactAccess;

  constructor(options: CityOptionsForRole<TRole>) {
    if (!options || typeof options !== "object") {
      throw new TypeError("City options are required");
    }

    this.role = options.role as TRole;

    if (options.role === "admin") {
      this.admin_access = new AdminPactAccess({
        base_url: options.federation_url,
        admin_secret_key: options.admin_secret_key,
        fetch: options.fetch,
      });
      return;
    }

    this.user_access = new UserPactAccess({
      base_url: options.federation_url,
      city_id: options.city_id,
      user_token: options.user_token,
      fetch: options.fetch,
    });
  }

  /**
   * User 角色的 AI 调用入口。
   */
  get ai(): UserPactAccess["ai"] {
    return this.require_user().ai;
  }

  /**
   * User 角色的支付入口。
   */
  get payment(): UserPactAccess["payment"] {
    return this.require_user().payment;
  }

  /**
   * Admin 角色的余额服务入口。
   */
  get balance(): AdminPactAccess["balance"] {
    return this.require_admin().balance;
  }

  /**
   * Admin 角色的环境变量服务入口。
   */
  get env(): AdminPactAccess["env"] {
    return this.require_admin().env;
  }

  /**
   * Admin 角色的 City 管理入口。
   */
  get cities(): AdminPactAccess["cities"] {
    return this.require_admin().cities;
  }

  /**
   * 获取普通 service 调用器。
   */
  service(name: string): ServiceClient {
    return this.admin_access?.service(name) ?? this.require_user().service(name);
  }

  /**
   * 列出当前 Federation 暴露的 service。
   */
  listServices(): Promise<AdminServiceSummary[] | UserServiceSummary[]> {
    return this.admin_access?.listServices() ?? this.require_user().listServices();
  }

  /**
   * 列出 Federation 模型目录。
   */
  listModels(): Promise<AdminModelRecord[]> {
    return this.require_admin().listModels();
  }

  /**
   * 读取 Federation 聚合说明文档。
   */
  instruction(): Promise<string> {
    return this.require_admin().instruction();
  }

  private require_admin(): AdminPactAccess {
    if (!this.admin_access) {
      throw new TypeError("City role admin is required for this operation");
    }
    return this.admin_access;
  }

  private require_user(): UserPactAccess {
    if (!this.user_access) {
      throw new TypeError("City role user is required for this operation");
    }
    return this.user_access;
  }
}
