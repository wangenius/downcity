/**
 * Accounts 管理侧查询。
 *
 * 关键说明（中文）
 * - 管理侧列表只依赖原始 SQL statement，和登录流程解耦。
 * - 拆出后 AccountsService 主模块专注路由、认证和 token 签发。
 */

import { readPreparedAll } from "./db.js";
import {
  AUTH_SESSION_TABLE,
  AUTH_USER_TABLE,
  USER_PROFILE_TABLE,
} from "./schema.js";

/**
 * 原始 statement 创建函数。
 */
type RawPrepare = (sql: string) => any;

/**
 * 读取管理侧用户列表。
 */
export async function listAccountUsers(raw_prepare: RawPrepare): Promise<Record<string, unknown>[]> {
  return await readPreparedAll(
    raw_prepare(
      `SELECT
        u.id as user_id,
        u.email as auth_email,
        u.emailVerified as email_verified,
        u.name as auth_name,
        u.image as auth_image,
        u.createdAt as auth_created_at,
        u.updatedAt as auth_updated_at,
        p.email as profile_email,
        p.display_name,
        p.avatar_url,
        p.bio,
        p.created_at as profile_created_at,
        p.updated_at as profile_updated_at
      FROM ${AUTH_USER_TABLE} u
      LEFT JOIN ${USER_PROFILE_TABLE} p ON p.user_id = u.id
      ORDER BY u.createdAt DESC`,
    ),
    [],
  );
}

/**
 * 读取管理侧 session 列表。
 */
export async function listAccountSessions(raw_prepare: RawPrepare): Promise<Record<string, unknown>[]> {
  const rows = await readPreparedAll(
    raw_prepare(`SELECT id as session_id, userId as user_id, expiresAt as expires_at, createdAt as created_at FROM ${AUTH_SESSION_TABLE} ORDER BY expiresAt DESC`),
    [],
  );
  return rows.map((row) => ({
    ...row,
    status: new Date(String(row.expires_at ?? "")).getTime() > Date.now() ? "active" : "expired",
  }));
}
