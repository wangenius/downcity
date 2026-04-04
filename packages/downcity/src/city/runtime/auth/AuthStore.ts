/**
 * 统一账户存储层。
 *
 * 关键点（中文）
 * - 该模块只负责 `auth_*` 表的读写，不处理密码校验与 HTTP 语义。
 * - 数据仍落在 console 的 SQLite 中，与现有控制面共享底层存储。
 */

import fs from "fs-extra";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";
import { getConsoleShipDbPath } from "@/city/runtime/console/ConsolePaths.js";
import type { AuthIssuedToken, AuthTokenSummary } from "@/shared/types/auth/AuthToken.js";
import {
  AUTH_DEFAULT_ROLES,
  AUTH_PERMISSION_DESCRIPTIONS,
  AUTH_PERMISSION_KEYS,
  type AuthDefaultRoleName,
  type AuthPermissionKey,
} from "@/shared/types/auth/AuthPermission.js";
import type {
  AuthAuditLog,
  AuthPermission,
  AuthRole,
  AuthTokenRecord,
  AuthUser,
} from "@/shared/types/auth/AuthTypes.js";
import { ensureConsoleStoreSchema } from "@/shared/utils/store/StoreSchema.js";
import {
  nowIso,
  normalizeNonEmptyText,
  optionalTrimmedText,
  type ConsoleStoreContext,
} from "@/shared/utils/store/StoreShared.js";

/**
 * AuthStore 构造参数。
 */
export interface AuthStoreOptions {
  /**
   * SQLite 数据库路径。
   */
  dbPath?: string;
}

type SqliteRow = Record<string, unknown>;

/**
 * AuthStore 门面。
 */
export class AuthStore {
  private readonly sqlite: Database.Database;
  private readonly context: ConsoleStoreContext;

  constructor(options: AuthStoreOptions = {}) {
    const dbPath = path.resolve(options.dbPath || getConsoleShipDbPath());
    fs.ensureDirSync(path.dirname(dbPath));
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.context = {
      sqlite: this.sqlite,
      db: drizzle(this.sqlite),
    };
    ensureConsoleStoreSchema(this.context);
  }

  /**
   * 关闭数据库连接。
   */
  close(): void {
    this.sqlite.close();
  }

  /**
   * 返回当前用户数量。
   */
  countUsers(): number {
    const row = this.sqlite.prepare("SELECT COUNT(*) as count FROM auth_users").get() as
      | { count?: unknown }
      | undefined;
    return Number(row?.count || 0);
  }

  /**
   * 幂等写入默认角色与权限目录。
   */
  ensureDefaultCatalog(): void {
    const now = nowIso();
    const tx = this.sqlite.transaction(() => {
      const roleIds = new Map<AuthDefaultRoleName, string>();
      for (const role of AUTH_DEFAULT_ROLES) {
        const existing = this.sqlite
          .prepare("SELECT id FROM auth_roles WHERE name = ?")
          .get(role.name) as { id?: unknown } | undefined;
        if (existing?.id) {
          this.sqlite
            .prepare(
              "UPDATE auth_roles SET description = ?, updated_at = ? WHERE id = ?",
            )
            .run(role.description, now, String(existing.id));
          roleIds.set(role.name, String(existing.id));
        } else {
          const id = nanoid();
          this.sqlite
            .prepare(
              "INSERT INTO auth_roles (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
            .run(id, role.name, role.description, now, now);
          roleIds.set(role.name, id);
        }
      }

      const permissionIds = new Map<AuthPermissionKey, string>();
      for (const permission of AUTH_PERMISSION_KEYS) {
        const description = AUTH_PERMISSION_DESCRIPTIONS[permission];
        const existing = this.sqlite
          .prepare("SELECT id FROM auth_permissions WHERE key = ?")
          .get(permission) as { id?: unknown } | undefined;
        if (existing?.id) {
          this.sqlite
            .prepare(
              "UPDATE auth_permissions SET description = ?, updated_at = ? WHERE id = ?",
            )
            .run(description, now, String(existing.id));
          permissionIds.set(permission, String(existing.id));
        } else {
          const id = nanoid();
          this.sqlite
            .prepare(
              "INSERT INTO auth_permissions (id, key, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
            .run(id, permission, description, now, now);
          permissionIds.set(permission, id);
        }
      }

      for (const role of AUTH_DEFAULT_ROLES) {
        const roleId = roleIds.get(role.name);
        if (!roleId) continue;
        for (const permission of role.permissions) {
          const permissionId = permissionIds.get(permission);
          if (!permissionId) continue;
          this.sqlite
            .prepare(
              "INSERT OR IGNORE INTO auth_role_permissions (id, role_id, permission_id, created_at) VALUES (?, ?, ?, ?)",
            )
            .run(nanoid(), roleId, permissionId, now);
        }
      }
    });
    tx();
  }

  /**
   * 创建用户。
   */
  createUser(input: {
    username: string;
    passwordHash: string;
    displayName?: string;
    status?: "active" | "disabled";
  }): AuthUser {
    const id = nanoid();
    const now = nowIso();
    const username = normalizeNonEmptyText(input.username, "username");
    const passwordHash = normalizeNonEmptyText(input.passwordHash, "passwordHash");
    const displayName = optionalTrimmedText(input.displayName);
    const status = input.status === "disabled" ? "disabled" : "active";
    this.sqlite
      .prepare(
        "INSERT INTO auth_users (id, username, password_hash, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, username, passwordHash, displayName || null, status, now, now);
    return {
      id,
      username,
      passwordHash,
      displayName,
      status,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 根据用户名读取用户。
   */
  findUserByUsername(usernameInput: string): AuthUser | null {
    const username = normalizeNonEmptyText(usernameInput, "username");
    const row = this.sqlite
      .prepare("SELECT * FROM auth_users WHERE username = ?")
      .get(username) as SqliteRow | undefined;
    return row ? this.toAuthUser(row) : null;
  }

  /**
   * 根据用户 ID 读取用户。
   */
  getUserById(userIdInput: string): AuthUser | null {
    const userId = normalizeNonEmptyText(userIdInput, "userId");
    const row = this.sqlite
      .prepare("SELECT * FROM auth_users WHERE id = ?")
      .get(userId) as SqliteRow | undefined;
    return row ? this.toAuthUser(row) : null;
  }

  /**
   * 读取全部用户列表。
   */
  listUsers(): AuthUser[] {
    const rows = this.sqlite
      .prepare("SELECT * FROM auth_users ORDER BY username ASC")
      .all() as SqliteRow[];
    return rows.map((row) => this.toAuthUser(row));
  }

  /**
   * 更新用户基础资料。
   */
  updateUser(params: {
    userId: string;
    displayName?: string;
    status?: "active" | "disabled";
  }): AuthUser | null {
    const userId = normalizeNonEmptyText(params.userId, "userId");
    const current = this.getUserById(userId);
    if (!current) return null;
    const nextDisplayName = optionalTrimmedText(params.displayName);
    const nextStatus = params.status === "disabled" ? "disabled" : "active";
    const updatedAt = nowIso();
    this.sqlite
      .prepare(
        "UPDATE auth_users SET display_name = ?, status = ?, updated_at = ? WHERE id = ?",
      )
      .run(nextDisplayName || null, nextStatus, updatedAt, userId);
    return this.getUserById(userId);
  }

  /**
   * 更新用户密码哈希。
   */
  updateUserPasswordHash(params: {
    userId: string;
    passwordHash: string;
  }): AuthUser | null {
    const userId = normalizeNonEmptyText(params.userId, "userId");
    const passwordHash = normalizeNonEmptyText(params.passwordHash, "passwordHash");
    const current = this.getUserById(userId);
    if (!current) return null;
    const updatedAt = nowIso();
    this.sqlite
      .prepare(
        "UPDATE auth_users SET password_hash = ?, updated_at = ? WHERE id = ?",
      )
      .run(passwordHash, updatedAt, userId);
    return this.getUserById(userId);
  }

  /**
   * 给用户绑定角色。
   */
  assignRoleToUser(params: { userId: string; roleName: AuthDefaultRoleName | string }): void {
    const userId = normalizeNonEmptyText(params.userId, "userId");
    const role = this.sqlite
      .prepare("SELECT id FROM auth_roles WHERE name = ?")
      .get(normalizeNonEmptyText(params.roleName, "roleName")) as { id?: unknown } | undefined;
    if (!role?.id) throw new Error(`Unknown role: ${params.roleName}`);
    this.sqlite
      .prepare(
        "INSERT OR IGNORE INTO auth_user_roles (id, user_id, role_id, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(nanoid(), userId, String(role.id), nowIso());
  }

  /**
   * 读取用户角色名列表。
   */
  listRoleNamesByUserId(userIdInput: string): string[] {
    const userId = normalizeNonEmptyText(userIdInput, "userId");
    const rows = this.sqlite
      .prepare(
        `
          SELECT DISTINCT roles.name as name
          FROM auth_roles roles
          INNER JOIN auth_user_roles links ON links.role_id = roles.id
          WHERE links.user_id = ?
          ORDER BY roles.name ASC
        `,
      )
      .all(userId) as Array<{ name?: unknown }>;
    return rows.map((row) => String(row.name || "").trim()).filter(Boolean);
  }

  /**
   * 清空用户当前绑定的全部角色。
   */
  clearRolesByUserId(userIdInput: string): void {
    const userId = normalizeNonEmptyText(userIdInput, "userId");
    this.sqlite
      .prepare("DELETE FROM auth_user_roles WHERE user_id = ?")
      .run(userId);
  }

  /**
   * 用新的角色集合覆盖用户角色绑定。
   */
  replaceRolesByUserId(params: {
    userId: string;
    roleNames: string[];
  }): string[] {
    const userId = normalizeNonEmptyText(params.userId, "userId");
    const roleNames = [...new Set(params.roleNames.map((item) => String(item || "").trim()).filter(Boolean))];
    const tx = this.sqlite.transaction(() => {
      this.clearRolesByUserId(userId);
      for (const roleName of roleNames) {
        this.assignRoleToUser({
          userId,
          roleName,
        });
      }
    });
    tx();
    return this.listRoleNamesByUserId(userId);
  }

  /**
   * 统计拥有指定角色且处于 active 状态的用户数量。
   */
  countActiveUsersByRole(roleNameInput: string): number {
    const roleName = normalizeNonEmptyText(roleNameInput, "roleName");
    const row = this.sqlite
      .prepare(
        `
          SELECT COUNT(DISTINCT users.id) as count
          FROM auth_users users
          INNER JOIN auth_user_roles user_roles ON user_roles.user_id = users.id
          INNER JOIN auth_roles roles ON roles.id = user_roles.role_id
          WHERE users.status = 'active' AND roles.name = ?
        `,
      )
      .get(roleName) as { count?: unknown } | undefined;
    return Number(row?.count || 0);
  }

  /**
   * 读取用户权限 key 列表。
   */
  listPermissionKeysByUserId(userIdInput: string): AuthPermissionKey[] {
    const userId = normalizeNonEmptyText(userIdInput, "userId");
    const rows = this.sqlite
      .prepare(
        `
          SELECT DISTINCT perms.key as key
          FROM auth_permissions perms
          INNER JOIN auth_role_permissions rp ON rp.permission_id = perms.id
          INNER JOIN auth_user_roles ur ON ur.role_id = rp.role_id
          WHERE ur.user_id = ?
          ORDER BY perms.key ASC
        `,
      )
      .all(userId) as Array<{ key?: unknown }>;
    return rows
      .map((row) => String(row.key || "").trim())
      .filter(Boolean) as AuthPermissionKey[];
  }

  /**
   * 创建 token 记录。
   */
  createToken(input: {
    userId: string;
    name: string;
    tokenHash: string;
    expiresAt?: string;
  }): AuthTokenRecord {
    const id = nanoid();
    const now = nowIso();
    const userId = normalizeNonEmptyText(input.userId, "userId");
    const name = normalizeNonEmptyText(input.name, "name");
    const tokenHash = normalizeNonEmptyText(input.tokenHash, "tokenHash");
    const expiresAt = optionalTrimmedText(input.expiresAt);
    this.sqlite
      .prepare(
        "INSERT INTO auth_tokens (id, user_id, name, token_hash, expires_at, revoked_at, last_used_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)",
      )
      .run(id, userId, name, tokenHash, expiresAt || null, now, now);
    return {
      id,
      userId,
      name,
      tokenHash,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 根据 token 哈希读取记录。
   */
  findTokenByHash(tokenHashInput: string): AuthTokenRecord | null {
    const tokenHash = normalizeNonEmptyText(tokenHashInput, "tokenHash");
    const row = this.sqlite
      .prepare("SELECT * FROM auth_tokens WHERE token_hash = ?")
      .get(tokenHash) as SqliteRow | undefined;
    return row ? this.toAuthToken(row) : null;
  }

  /**
   * 根据 token ID 读取记录。
   */
  getTokenById(tokenIdInput: string): AuthTokenRecord | null {
    const tokenId = normalizeNonEmptyText(tokenIdInput, "tokenId");
    const row = this.sqlite
      .prepare("SELECT * FROM auth_tokens WHERE id = ?")
      .get(tokenId) as SqliteRow | undefined;
    return row ? this.toAuthToken(row) : null;
  }

  /**
   * 读取用户 token 列表。
   */
  listTokensByUserId(userIdInput: string): AuthTokenRecord[] {
    const userId = normalizeNonEmptyText(userIdInput, "userId");
    const rows = this.sqlite
      .prepare("SELECT * FROM auth_tokens WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as SqliteRow[];
    return rows.map((row) => this.toAuthToken(row));
  }

  /**
   * 更新 token 最后使用时间。
   */
  touchToken(tokenIdInput: string): void {
    const tokenId = normalizeNonEmptyText(tokenIdInput, "tokenId");
    const now = nowIso();
    this.sqlite
      .prepare("UPDATE auth_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, tokenId);
  }

  /**
   * 吊销 token。
   */
  revokeToken(tokenIdInput: string): AuthTokenRecord | null {
    const tokenId = normalizeNonEmptyText(tokenIdInput, "tokenId");
    const now = nowIso();
    this.sqlite
      .prepare("UPDATE auth_tokens SET revoked_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, tokenId);
    return this.getTokenById(tokenId);
  }

  /**
   * 删除 token。
   */
  deleteToken(tokenIdInput: string): boolean {
    const tokenId = normalizeNonEmptyText(tokenIdInput, "tokenId");
    const result = this.sqlite
      .prepare("DELETE FROM auth_tokens WHERE id = ?")
      .run(tokenId);
    return result.changes > 0;
  }

  /**
   * 写入审计日志。
   */
  insertAuditLog(input: {
    actorUserId?: string;
    actorTokenId?: string;
    resourceType: string;
    resourceId?: string;
    action: string;
    result: string;
    requestId?: string;
    ip?: string;
    userAgent?: string;
    metaJson?: string;
  }): AuthAuditLog {
    const id = nanoid();
    const createdAt = nowIso();
    const row: AuthAuditLog = {
      id,
      actorUserId: optionalTrimmedText(input.actorUserId),
      actorTokenId: optionalTrimmedText(input.actorTokenId),
      resourceType: normalizeNonEmptyText(input.resourceType, "resourceType"),
      resourceId: optionalTrimmedText(input.resourceId),
      action: normalizeNonEmptyText(input.action, "action"),
      result: normalizeNonEmptyText(input.result, "result"),
      requestId: optionalTrimmedText(input.requestId),
      ip: optionalTrimmedText(input.ip),
      userAgent: optionalTrimmedText(input.userAgent),
      metaJson: optionalTrimmedText(input.metaJson),
      createdAt,
    };
    this.sqlite
      .prepare(
        "INSERT INTO auth_audit_logs (id, actor_user_id, actor_token_id, resource_type, resource_id, action, result, request_id, ip, user_agent, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        row.id,
        row.actorUserId || null,
        row.actorTokenId || null,
        row.resourceType,
        row.resourceId || null,
        row.action,
        row.result,
        row.requestId || null,
        row.ip || null,
        row.userAgent || null,
        row.metaJson || null,
        row.createdAt,
      );
    return row;
  }

  /**
   * 将 token 记录转换为对外摘要。
   */
  toTokenSummary(record: AuthTokenRecord): AuthTokenSummary {
    return {
      id: record.id,
      name: record.name,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * 将 token 记录与明文 token 合成为一次性返回体。
   */
  toIssuedToken(record: AuthTokenRecord, token: string): AuthIssuedToken {
    return {
      ...this.toTokenSummary(record),
      token,
    };
  }

  private toAuthUser(row: SqliteRow): AuthUser {
    return {
      id: String(row.id || ""),
      username: String(row.username || ""),
      passwordHash: String(row.password_hash || ""),
      displayName: optionalTrimmedText(String(row.display_name || "")),
      status: String(row.status || "active") === "disabled" ? "disabled" : "active",
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    };
  }

  private toAuthToken(row: SqliteRow): AuthTokenRecord {
    return {
      id: String(row.id || ""),
      userId: String(row.user_id || ""),
      name: String(row.name || ""),
      tokenHash: String(row.token_hash || ""),
      expiresAt: optionalTrimmedText(String(row.expires_at || "")),
      revokedAt: optionalTrimmedText(String(row.revoked_at || "")),
      lastUsedAt: optionalTrimmedText(String(row.last_used_at || "")),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    };
  }

  private _unused(_row: SqliteRow): AuthRole | AuthPermission {
    throw new Error("unused");
  }
}
