/**
 * City 公开类型模块。
 *
 * City 是访问 City 的统一入口：开发者只需要声明访问角色，
 * SDK 会在内部选择 admin 或 user 能力面。
 */

import type { FetchLike } from "../http.js";

/**
 * City 访问角色。
 */
export type CityRole = "admin" | "user";

/**
 * City 共享构造参数。
 */
export interface CityClientBaseOptions {
  /**
   * City 的 HTTP 入口地址。
   *
   * 示例：`https://city.example.com` 或 `http://localhost:43127`。
   */
  city_url: string;

  /**
   * 自定义 fetch 实现。
   *
   * 主要用于测试、Worker 运行时适配，或在请求层注入日志与追踪。
   */
  fetch?: FetchLike;
}

/**
 * Admin City 构造参数。
 */
export interface AdminCityOptions extends CityClientBaseOptions {
  /**
   * 使用 admin 身份访问 City。
   */
  role: "admin";

  /**
   * City 管理密钥。
   *
   * 未传入时会由 City 回退读取 `DOWNCITY_CITY_ADMIN_SECRET_KEY`。
   */
  admin_secret_key?: string;
}

/**
 * User City 构造参数。
 */
export interface UserCityOptions extends CityClientBaseOptions {
  /**
   * 使用 user 身份访问 City。
   */
  role: "user";

  /**
   * 当前 user_token 绑定的 Town ID。
   *
   * AI 与普通 service action 调用会自动把该值注入为 `town_id`。
   */
  town_id?: string;

  /**
   * 终端用户访问 token。
   */
  user_token?: string;
}

/**
 * City 构造参数。
 */
export type CityOptions = AdminCityOptions | UserCityOptions;

/**
 * 按角色收窄后的 City 构造参数。
 */
export type CityOptionsForRole<TRole extends CityRole> = TRole extends "admin"
  ? AdminCityOptions
  : UserCityOptions;
