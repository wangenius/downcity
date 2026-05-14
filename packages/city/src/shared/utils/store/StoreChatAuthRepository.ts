/**
 * ConsoleStore Chat Auth 仓储。
 *
 * 关键点（中文）
 * - chat authorization 是 city 全局业务数据，不按 agent/projectRoot 隔离。
 * - 本模块只负责结构化表的 CRUD，不处理插件执行与 UI 语义。
 */

import type {
  StoredChatAuthChannelDefault,
  StoredChatAuthRole,
  StoredChatAuthRolePermission,
  StoredChatAuthSnapshot,
  StoredChatAuthUserRole,
} from "@/shared/types/Store.js";
import type { ConsoleStoreContext } from "./StoreShared.js";
import {
  normalizeChannelAccountChannel,
  normalizeNonEmptyText,
  nowIso,
  optionalTrimmedText,
} from "./StoreShared.js";

/**
 * 读取 city 全局 chat auth 快照。
 */
export function getChatAuthSnapshot(
  context: ConsoleStoreContext,
): StoredChatAuthSnapshot {
  const roles = context.sqlite
    .prepare(
      `
      SELECT role_id, name, description, created_at, updated_at
      FROM chat_auth_roles
      ORDER BY role_id ASC;
      `,
    )
    .all() as Array<Record<string, unknown>>;
  const rolePermissions = context.sqlite
    .prepare(
      `
      SELECT role_id, permission, created_at
      FROM chat_auth_role_permissions
      ORDER BY role_id ASC, permission ASC;
      `,
    )
    .all() as Array<Record<string, unknown>>;
  const channelDefaults = context.sqlite
    .prepare(
      `
      SELECT channel, role_id, created_at, updated_at
      FROM chat_auth_channel_defaults
      ORDER BY channel ASC;
      `,
    )
    .all() as Array<Record<string, unknown>>;
  const userRoles = context.sqlite
    .prepare(
      `
      SELECT channel, user_id, role_id, created_at, updated_at
      FROM chat_auth_user_roles
      ORDER BY channel ASC, user_id ASC;
      `,
    )
    .all() as Array<Record<string, unknown>>;

  return {
    roles: roles.map((row): StoredChatAuthRole | null => {
      const roleId = String(row.role_id || "").trim();
      const name = String(row.name || "").trim();
      if (!roleId || !name) return null;
      return {
        roleId,
        name,
        description: optionalTrimmedText(String(row.description || "")),
        createdAt: String(row.created_at || ""),
        updatedAt: String(row.updated_at || ""),
      };
    }).filter((row): row is StoredChatAuthRole => Boolean(row)),
    rolePermissions: rolePermissions.map((row) => ({
      roleId: String(row.role_id || "").trim(),
      permission: String(row.permission || "").trim(),
      createdAt: String(row.created_at || ""),
    })).filter((row): row is StoredChatAuthRolePermission =>
      Boolean(row.roleId && row.permission),
    ),
    channelDefaults: channelDefaults.map((row) => ({
      channel: normalizeChannelAccountChannel(String(row.channel || "")),
      roleId: String(row.role_id || "").trim(),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    })).filter((row): row is StoredChatAuthChannelDefault => Boolean(row.roleId)),
    userRoles: userRoles.map((row) => ({
      channel: normalizeChannelAccountChannel(String(row.channel || "")),
      userId: String(row.user_id || "").trim(),
      roleId: String(row.role_id || "").trim(),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    })).filter((row): row is StoredChatAuthUserRole =>
      Boolean(row.userId && row.roleId),
    ),
  };
}

/**
 * 覆盖写入 city 全局 chat auth 快照。
 */
export function replaceChatAuthSnapshot(
  context: ConsoleStoreContext,
  snapshot: StoredChatAuthSnapshot,
): void {
  const roles = snapshot.roles;
  const rolePermissions = snapshot.rolePermissions;
  const channelDefaults = snapshot.channelDefaults;
  const userRoles = snapshot.userRoles;

  const tx = context.sqlite.transaction(() => {
    context.sqlite.exec("DELETE FROM chat_auth_role_permissions;");
    context.sqlite.exec("DELETE FROM chat_auth_channel_defaults;");
    context.sqlite.exec("DELETE FROM chat_auth_user_roles;");
    context.sqlite.exec("DELETE FROM chat_auth_roles;");

    const insertRole = context.sqlite.prepare(`
      INSERT INTO chat_auth_roles (role_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?);
    `);
    for (const role of roles) {
      insertRole.run(
        normalizeNonEmptyText(role.roleId, "chat auth role id"),
        normalizeNonEmptyText(role.name, "chat auth role name"),
        optionalTrimmedText(role.description) || null,
        role.createdAt || nowIso(),
        role.updatedAt || nowIso(),
      );
    }

    const insertPermission = context.sqlite.prepare(`
      INSERT OR IGNORE INTO chat_auth_role_permissions (role_id, permission, created_at)
      VALUES (?, ?, ?);
    `);
    for (const item of rolePermissions) {
      insertPermission.run(
        normalizeNonEmptyText(item.roleId, "chat auth role id"),
        normalizeNonEmptyText(item.permission, "chat auth permission"),
        item.createdAt || nowIso(),
      );
    }

    const insertDefault = context.sqlite.prepare(`
      INSERT INTO chat_auth_channel_defaults (channel, role_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(channel) DO UPDATE SET
        role_id = excluded.role_id,
        updated_at = excluded.updated_at;
    `);
    for (const item of channelDefaults) {
      insertDefault.run(
        normalizeChannelAccountChannel(item.channel),
        normalizeNonEmptyText(item.roleId, "chat auth role id"),
        item.createdAt || nowIso(),
        item.updatedAt || nowIso(),
      );
    }

    const insertUserRole = context.sqlite.prepare(`
      INSERT INTO chat_auth_user_roles (channel, user_id, role_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(channel, user_id) DO UPDATE SET
        role_id = excluded.role_id,
        updated_at = excluded.updated_at;
    `);
    for (const item of userRoles) {
      insertUserRole.run(
        normalizeChannelAccountChannel(item.channel),
        normalizeNonEmptyText(item.userId, "chat auth user id"),
        normalizeNonEmptyText(item.roleId, "chat auth role id"),
        item.createdAt || nowIso(),
        item.updatedAt || nowIso(),
      );
    }
  });
  tx();
}

/**
 * 设置单个 city 全局 chat auth 用户角色。
 */
export function setChatAuthUserRole(
  context: ConsoleStoreContext,
  params: {
    channel: string;
    userId: string;
    roleId: string;
  },
): void {
  const channel = normalizeChannelAccountChannel(params.channel);
  const userId = normalizeNonEmptyText(params.userId, "chat auth user id");
  const roleId = normalizeNonEmptyText(params.roleId, "chat auth role id");
  const existing = context.sqlite
    .prepare(
      "SELECT created_at FROM chat_auth_user_roles WHERE channel = ? AND user_id = ? LIMIT 1;",
    )
    .get(channel, userId) as { created_at?: unknown } | undefined;
  const createdAt = String(existing?.created_at || "") || nowIso();
  const updatedAt = nowIso();
  context.sqlite.prepare(
    `
    INSERT INTO chat_auth_user_roles (channel, user_id, role_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(channel, user_id) DO UPDATE SET
      role_id = excluded.role_id,
      updated_at = excluded.updated_at;
    `,
  ).run(channel, userId, roleId, createdAt, updatedAt);
}
