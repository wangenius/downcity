/**
 * City 统一访问入口。
 *
 * City 面向开发者表达“我以某种角色进入 City”，内部再委托给
 * admin / user 访问层，避免用户在第一层概念上关心 client 拆分。
 */

import { AdminCityAccess } from "./admin/index.js";
import { UserCityAccess } from "./user/index.js";
import type { ServiceClient } from "./invoker/invoker.js";
import type { CityOptionsForRole, CityRole } from "./types/city.js";
import type { AdminModelRecord, AdminServiceSummary } from "./admin/types.js";
import type { UserServiceSummary } from "./user/types.js";

/**
 * Downcity City。
 */
export class City<TRole extends CityRole = CityRole> {
  /**
   * 当前 City 访问角色。
   */
  readonly role: TRole;

  /**
   * Admin 能力面。
   *
   * 仅 `role: "admin"` 时可用。
   */
  private readonly admin_access?: AdminCityAccess;

  /**
   * User 能力面。
   *
   * 仅 `role: "user"` 时可用。
   */
  private readonly user_access?: UserCityAccess;

  constructor(options: CityOptionsForRole<TRole>) {
    if (!options || typeof options !== "object") {
      throw new TypeError("City options are required");
    }

    this.role = options.role as TRole;

    if (options.role === "admin") {
      this.admin_access = new AdminCityAccess({
        base_url: options.city_url,
        admin_secret_key: options.admin_secret_key,
        fetch: options.fetch,
      });
      return;
    }

    this.user_access = new UserCityAccess({
      base_url: options.city_url,
      town_id: options.town_id,
      user_token: options.user_token,
      fetch: options.fetch,
    });
  }

  /**
   * User City 的 AI 调用入口。
   */
  get ai(): UserCityAccess["ai"] {
    return this.require_user().ai;
  }

  /**
   * User City 的支付入口。
   */
  get payment(): UserCityAccess["payment"] {
    return this.require_user().payment;
  }

  /**
   * Admin City 的余额服务入口。
   */
  get balance(): AdminCityAccess["balance"] {
    return this.require_admin().balance;
  }

  /**
   * Admin City 的环境变量服务入口。
   */
  get env(): AdminCityAccess["env"] {
    return this.require_admin().env;
  }

  /**
   * Admin City 的 Town 管理入口。
   */
  get towns(): AdminCityAccess["towns"] {
    return this.require_admin().towns;
  }

  /**
   * 获取普通 service 调用器。
   */
  service(name: string): ServiceClient {
    return this.admin_access?.service(name) ?? this.require_user().service(name);
  }

  /**
   * 列出当前 City 暴露的 service。
   */
  listServices(): Promise<AdminServiceSummary[] | UserServiceSummary[]> {
    return this.admin_access?.listServices() ?? this.require_user().listServices();
  }

  /**
   * 列出 City 模型目录。
   */
  listModels(): Promise<AdminModelRecord[]> {
    return this.require_admin().listModels();
  }

  /**
   * 读取 City 聚合说明文档。
   */
  instruction(): Promise<string> {
    return this.require_admin().instruction();
  }

  private require_admin(): AdminCityAccess {
    if (!this.admin_access) {
      throw new TypeError("City role admin is required for this operation");
    }
    return this.admin_access;
  }

  private require_user(): UserCityAccess {
    if (!this.user_access) {
      throw new TypeError("City role user is required for this operation");
    }
    return this.user_access;
  }
}
