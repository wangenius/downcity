/**
 * Gate 统一访问入口。
 *
 * Gate 面向开发者表达“我以某种角色进入 City”，内部再委托给
 * admin / user 访问层，避免用户在第一层概念上关心 client 拆分。
 */

import { AdminGateAccess } from "./admin/index.js";
import { UserGateAccess } from "./user/index.js";
import type { ServiceClient } from "./invoker/invoker.js";
import type { GateOptionsForRole, GateRole } from "./types/gate.js";
import type { AdminModelRecord, AdminServiceSummary } from "./admin/types.js";
import type { UserServiceSummary } from "./user/types.js";

/**
 * Downcity Gate。
 */
export class Gate<TRole extends GateRole = GateRole> {
  /**
   * 当前 Gate 访问角色。
   */
  readonly role: TRole;

  /**
   * Admin 能力面。
   *
   * 仅 `role: "admin"` 时可用。
   */
  private readonly admin_access?: AdminGateAccess;

  /**
   * User 能力面。
   *
   * 仅 `role: "user"` 时可用。
   */
  private readonly user_access?: UserGateAccess;

  constructor(options: GateOptionsForRole<TRole>) {
    if (!options || typeof options !== "object") {
      throw new TypeError("Gate options are required");
    }

    this.role = options.role as TRole;

    if (options.role === "admin") {
      this.admin_access = new AdminGateAccess({
        base_url: options.city_url,
        admin_secret_key: options.admin_secret_key,
        fetch: options.fetch,
      });
      return;
    }

    this.user_access = new UserGateAccess({
      base_url: options.city_url,
      studio_id: options.studio_id,
      user_token: options.user_token,
      fetch: options.fetch,
    });
  }

  /**
   * User Gate 的 AI 调用入口。
   */
  get ai(): UserGateAccess["ai"] {
    return this.require_user().ai;
  }

  /**
   * User Gate 的支付入口。
   */
  get payment(): UserGateAccess["payment"] {
    return this.require_user().payment;
  }

  /**
   * Admin Gate 的余额服务入口。
   */
  get balance(): AdminGateAccess["balance"] {
    return this.require_admin().balance;
  }

  /**
   * Admin Gate 的环境变量服务入口。
   */
  get env(): AdminGateAccess["env"] {
    return this.require_admin().env;
  }

  /**
   * Admin Gate 的 Studio 管理入口。
   */
  get studios(): AdminGateAccess["studios"] {
    return this.require_admin().studios;
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

  private require_admin(): AdminGateAccess {
    if (!this.admin_access) {
      throw new TypeError("Gate role admin is required for this operation");
    }
    return this.admin_access;
  }

  private require_user(): UserGateAccess {
    if (!this.user_access) {
      throw new TypeError("Gate role user is required for this operation");
    }
    return this.user_access;
  }
}
