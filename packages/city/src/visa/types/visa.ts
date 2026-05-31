/**
 * Visa 公开类型模块。
 *
 * Visa 是访问 City 的统一入口：开发者只需要声明访问角色，
 * SDK 会在内部选择 admin 或 user 能力面。
 */

import type { FetchLike } from "../http.js";

/**
 * Visa 访问角色。
 */
export type VisaRole = "admin" | "user";

/**
 * Visa 共享构造参数。
 */
export interface VisaBaseOptions {
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
 * Admin Visa 构造参数。
 */
export interface AdminVisaOptions extends VisaBaseOptions {
  /**
   * 使用 admin 身份访问 City。
   */
  role: "admin";

  /**
   * City 管理密钥。
   *
   * 未传入时会由 Visa 回退读取 `DOWNCITY_CITY_ADMIN_SECRET_KEY`。
   */
  admin_secret_key?: string;
}

/**
 * User Visa 构造参数。
 */
export interface UserVisaOptions extends VisaBaseOptions {
  /**
   * 使用 user 身份访问 City。
   */
  role: "user";

  /**
   * 当前 user_token 绑定的 Bay ID。
   *
   * AI 与普通 service action 调用会自动把该值注入为 `bay_id`。
   */
  bay_id?: string;

  /**
   * 终端用户访问 token。
   */
  user_token?: string;
}

/**
 * Visa 构造参数。
 */
export type VisaOptions = AdminVisaOptions | UserVisaOptions;

/**
 * 按角色收窄后的 Visa 构造参数。
 */
export type VisaOptionsForRole<TRole extends VisaRole> = TRole extends "admin"
  ? AdminVisaOptions
  : UserVisaOptions;
