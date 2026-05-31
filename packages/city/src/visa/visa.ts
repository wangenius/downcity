/**
 * Visa 统一访问入口。
 *
 * Visa 面向开发者表达“我以某种角色进入 City”，内部再委托给
 * admin / user 访问层，避免用户在第一层概念上关心 client 拆分。
 */

import { AdminVisaAccess } from "./admin/index.js";
import { UserVisaAccess } from "./user/index.js";
import type { ServiceClient } from "./invoker/invoker.js";
import type { VisaOptionsForRole, VisaRole } from "./types/visa.js";
import type { AdminModelRecord, AdminServiceSummary } from "./admin/types.js";
import type { UserServiceSummary } from "./user/types.js";

/**
 * Downcity Visa。
 */
export class Visa<TRole extends VisaRole = VisaRole> {
  /**
   * 当前 Visa 访问角色。
   */
  readonly role: TRole;

  /**
   * Admin 能力面。
   *
   * 仅 `role: "admin"` 时可用。
   */
  private readonly admin_access?: AdminVisaAccess;

  /**
   * User 能力面。
   *
   * 仅 `role: "user"` 时可用。
   */
  private readonly user_access?: UserVisaAccess;

  constructor(options: VisaOptionsForRole<TRole>) {
    if (!options || typeof options !== "object") {
      throw new TypeError("Visa options are required");
    }

    this.role = options.role as TRole;

    if (options.role === "admin") {
      this.admin_access = new AdminVisaAccess({
        base_url: options.city_url,
        admin_secret_key: options.admin_secret_key,
        fetch: options.fetch,
      });
      return;
    }

    this.user_access = new UserVisaAccess({
      base_url: options.city_url,
      bay_id: options.bay_id,
      user_token: options.user_token,
      fetch: options.fetch,
    });
  }

  /**
   * User Visa 的 AI 调用入口。
   */
  get ai(): UserVisaAccess["ai"] {
    return this.require_user().ai;
  }

  /**
   * User Visa 的支付入口。
   */
  get payment(): UserVisaAccess["payment"] {
    return this.require_user().payment;
  }

  /**
   * Admin Visa 的余额服务入口。
   */
  get balance(): AdminVisaAccess["balance"] {
    return this.require_admin().balance;
  }

  /**
   * Admin Visa 的环境变量服务入口。
   */
  get env(): AdminVisaAccess["env"] {
    return this.require_admin().env;
  }

  /**
   * Admin Visa 的 Bay 管理入口。
   */
  get bays(): AdminVisaAccess["bays"] {
    return this.require_admin().bays;
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

  private require_admin(): AdminVisaAccess {
    if (!this.admin_access) {
      throw new TypeError("Visa role admin is required for this operation");
    }
    return this.admin_access;
  }

  private require_user(): UserVisaAccess {
    if (!this.user_access) {
      throw new TypeError("Visa role user is required for this operation");
    }
    return this.user_access;
  }
}
