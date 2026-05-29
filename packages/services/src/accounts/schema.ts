/**
 * Accounts 服务数据库 schema 模块。
 *
 * 负责定义服务自身维护的业务资料表：
 * - user_profile：给产品层直接展示的用户资料
 * - oauth_state：CLI / 轮询式 OAuth 流程的临时 state
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * 用户资料表名。
 */
export const USER_PROFILE_TABLE = "auth_profiles";

/**
 * Accounts 服务 OAuth state 表名。
 */
export const ACCOUNTS_OAUTH_STATE_TABLE = "service_accounts_oauth_states";

/**
 * 产品层使用的用户资料。
 */
export interface UserProfileRow extends Record<string, unknown> {
  /**
   * 对应 better-auth `user.id`。
   */
  user_id: string;

  /**
   * 当前资料使用的主邮箱。
   */
  email: string;

  /**
   * 产品层展示名。
   */
  display_name: string;

  /**
   * 产品层头像 URL。
   */
  avatar_url: string;

  /**
   * 用户简介。
   *
   * 当前默认保留为空串，后续可给业务层编辑。
   */
  bio: string;

  /**
   * 首次创建时间。
   */
  created_at: string;

  /**
   * 最近更新时间。
   */
  updated_at: string;
}

/**
 * OAuth 轮询 state 记录。
 */
export interface AccountsOAuthStateRow extends Record<string, unknown> {
  /**
   * OAuth state。
   */
  state: string;

  /**
   * 登录成功后要签发到哪个 product。
   */
  product_id: string;

  /**
   * 第三方 provider 标识。
   */
  provider: string;

  /**
   * 完成登录后回填的 InfraRuntime user_token。
   */
  user_token: string;

  /**
   * state 创建时间戳（毫秒）。
   */
  created_at: number;
}

/**
 * 用户资料表。
 */
export const userProfiles = sqliteTable(USER_PROFILE_TABLE, {
  /**
   * 对应 better-auth `user.id`。
   */
  user_id: text("user_id").primaryKey(),

  /**
   * 当前主邮箱。
   */
  email: text("email").notNull(),

  /**
   * 展示名。
   */
  display_name: text("display_name").notNull(),

  /**
   * 头像 URL。
   */
  avatar_url: text("avatar_url").notNull(),

  /**
   * 简介。
   */
  bio: text("bio").notNull(),

  /**
   * 创建时间。
   */
  created_at: text("created_at").notNull(),

  /**
   * 更新时间。
   */
  updated_at: text("updated_at").notNull(),
});

export const accountsOAuthStates = sqliteTable(ACCOUNTS_OAUTH_STATE_TABLE, {
  /**
   * OAuth state。
   */
  state: text("state").primaryKey(),

  /**
   * 登录成功后要签发到哪个 product。
   */
  product_id: text("product_id").notNull(),

  /**
   * provider 标识。
   */
  provider: text("provider").notNull(),

  /**
   * 完成登录后回填的 InfraRuntime user_token。
   */
  user_token: text("user_token").notNull(),

  /**
   * 创建时间戳（毫秒）。
   */
  created_at: integer("created_at").notNull(),
});
