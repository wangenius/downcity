/**
 * City 客户端构造类型模块。
 *
 * City 是访问 Federation 的统一客户端入口：开发者只需要声明访问角色，
 * SDK 会在内部选择 admin 或 user 能力面。底层 HTTP 协议实现位于 `pact/`。
 */

import type { FetchLike } from "../pact/http.js";

/**
 * City 访问角色。
 */
export type CityRole = "admin" | "user";

/**
 * City 客户端共享构造参数。
 */
export interface CityBaseOptions {
  /**
   * Federation 的 HTTP 入口地址。
   *
   * 示例：`https://city.example.com`、`http://localhost:43127`
   * 或本机 loopback HTTP：`http://127.0.0.1:15315`。
   */
  federation_url: string;

  /**
   * 自定义 fetch 实现。
   *
   * 主要用于测试、Worker 运行时适配，或在请求层注入日志与追踪。
   */
  fetch?: FetchLike;
}

/**
 * Admin 角色的 City 构造参数。
 */
export interface AdminCityOptions extends CityBaseOptions {
  /**
   * 使用 admin 身份访问 Federation。
   */
  role: "admin";

  /**
   * 当前管理的 City ID。
   *
   * token 签发等服务会自动使用该 ID，调用方无需再传 city_id。
   */
  city_id: string;

  /**
   * Federation 管理密钥。
   *
   * 未传入时会由 SDK 回退读取 `DOWNCITY_FEDERATION_ADMIN_SECRET_KEY`。
   */
  admin_secret_key?: string;
}

/**
 * User 角色的 City 构造参数。
 */
export interface UserCityOptions extends CityBaseOptions {
  /**
   * 使用 user 身份访问 Federation。
   */
  role: "user";

  /**
   * 当前 user_token 绑定的 City ID。
   *
   * 普通 service action 调用会自动把该值注入为 `city_id`。
   * AI 调用会优先使用 `user_token` 解析出的 City 身份。
   */
  city_id?: string;

  /**
   * 终端用户访问 token。
   *
   * 仅访问 public action（例如 accounts 本地登录）时可以暂不传。
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
