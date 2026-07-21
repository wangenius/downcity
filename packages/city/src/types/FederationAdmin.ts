/**
 * FederationAdmin 公共类型模块。
 *
 * FederationAdmin 只属于 Federation 控制面，不参与 City 或 Bureau 用户请求。
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
