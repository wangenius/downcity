/**
 * FederationAdmin 公共类型模块。
 *
 * FederationAdmin 是 Federation 全局控制面客户端，与终端用户 City 客户端隔离。
 */

import type { FetchLike } from "../pact/http.js";

/** FederationAdmin 构造参数。 */
export interface FederationAdminOptions {
  /** Federation 的 HTTP 入口地址。 */
  federation_url: string;

  /** Federation 全局管理 Bearer Secret。 */
  admin_secret_key: string;

  /** 自定义 fetch 实现。 */
  fetch?: FetchLike;
}
