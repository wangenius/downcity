/**
 * City City 本地状态类型。
 *
 * 关键点（中文）
 * - 只描述 City 自己保存的 City base 与 session 索引。
 * - `city` CLI 的 admin 配置只作为弱发现来源读取。
 */

import type { CityUserSession } from "./CitySession.js";
import type { CliLocale } from "./CliLocale.js";

/**
 * `city` CLI admin 配置文件结构。
 */
export interface CityAdminConfig {
  /**
   * `city` CLI 当前激活的 City base URL。
   */
  active_server_url?: unknown;

  /**
   * `city` CLI 保存的 City base 列表。
   */
  servers?: Array<{
    /**
     * base 展示名称。
     */
    name?: unknown;

    /**
     * City base URL。
     */
    base_url?: unknown;

    /**
     * 旧结构中的 City base URL 字段。
     */
    url?: unknown;

    /**
     * admin secret key。
     */
    admin_secret_key?: unknown;
  }>;
}

/**
 * City 本地保存的 City base。
 */
export interface CityLocalProfile {
  /**
   * base 展示名称。
   */
  name: string;

  /**
   * City base URL。
   */
  base_url: string;
}

/**
 * City 本地保存的 City user 连接状态。
 */
export interface CityLocalState {
  /**
   * 当前选择的 City base URL。
   */
  selected_base_url?: string;

  /**
   * 当前持久化的 CLI 语言。
   */
  cli_locale?: CliLocale;

  /**
   * City 本地保存的 City base 列表。
   */
  profiles?: CityLocalProfile[];

  /**
   * 按 City base URL 索引的 user session。
   */
  sessions?: Record<string, CityUserSession>;
}
