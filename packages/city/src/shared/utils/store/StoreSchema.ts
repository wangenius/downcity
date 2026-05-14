/**
 * ConsoleStore Schema 管理。
 *
 * 关键点（中文）
 * - 负责 `ConsoleStore` 的建表与轻量迁移。
 * - 启动时执行，不承担任何查询写入业务逻辑。
 */

import type { ConsoleStoreContext } from "./StoreShared.js";

/**
 * 初始化 ConsoleStore 所需表结构。
 */
export function ensureConsoleStoreSchema(context: ConsoleStoreContext): void {
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS model_providers (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      base_url TEXT,
      api_key_encrypted TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY NOT NULL,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      temperature REAL,
      max_tokens INTEGER,
      top_p REAL,
      frequency_penalty REAL,
      presence_penalty REAL,
      anthropic_version TEXT,
      is_paused INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureModelsTableColumns(context);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS models_provider_id_idx
    ON models(provider_id);
  `);
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS console_secure_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value_encrypted TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS env_entries (
      scope TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL,
      description TEXT,
      value_encrypted TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, agent_id, key)
    );
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS env_entries_scope_idx
    ON env_entries(scope);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS env_entries_agent_id_idx
    ON env_entries(agent_id);
  `);
  ensureEnvEntriesMigration(context);
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channel_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      channel TEXT NOT NULL,
      name TEXT NOT NULL,
      identity TEXT,
      owner TEXT,
      creator TEXT,
      bot_token_encrypted TEXT,
      app_id_encrypted TEXT,
      app_secret_encrypted TEXT,
      domain TEXT,
      sandbox INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS channel_accounts_channel_idx
    ON channel_accounts(channel);
  `);
  ensureChannelAccountsTableColumns(context);
  ensureChatAuthSchema(context);
  removeLegacyChatAuthSecureSettings(context);
  ensureAuthSchema(context);
}

/**
 * 初始化 city 全局 chat authorization 表结构。
 *
 * 关键点（中文）
 * - chat authorization 是 city 级业务数据，不属于 agent 项目配置。
 * - 使用结构化表而不是 JSON blob，便于查询、更新和后续审计。
 */
function ensureChatAuthSchema(context: ConsoleStoreContext): void {
  createChatAuthTables(context);
  if (chatAuthSchemaNeedsRebuild(context)) {
    rebuildChatAuthTables(context);
  }
  createChatAuthIndexes(context);
}

/**
 * 创建 city 全局 chat authorization 表。
 */
function createChatAuthTables(context: ConsoleStoreContext): void {
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_auth_roles (
      role_id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_auth_role_permissions (
      role_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (role_id, permission),
      FOREIGN KEY (role_id) REFERENCES chat_auth_roles(role_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    );
  `);
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_auth_channel_defaults (
      channel TEXT PRIMARY KEY NOT NULL CHECK (channel IN ('telegram', 'feishu', 'qq')),
      role_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES chat_auth_roles(role_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    );
  `);
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_auth_user_roles (
      channel TEXT NOT NULL CHECK (channel IN ('telegram', 'feishu', 'qq')),
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (channel, user_id),
      FOREIGN KEY (role_id) REFERENCES chat_auth_roles(role_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    );
  `);
}

/**
 * 创建 city 全局 chat authorization 查询索引。
 */
function createChatAuthIndexes(context: ConsoleStoreContext): void {
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS chat_auth_role_permissions_role_idx
    ON chat_auth_role_permissions(role_id);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS chat_auth_user_roles_role_idx
    ON chat_auth_user_roles(role_id);
  `);
}

/**
 * 判断旧版 chat authorization 表是否需要重建。
 */
function chatAuthSchemaNeedsRebuild(context: ConsoleStoreContext): boolean {
  const requiredForeignKeyTables = [
    "chat_auth_role_permissions",
    "chat_auth_channel_defaults",
    "chat_auth_user_roles",
  ];
  for (const tableName of requiredForeignKeyTables) {
    const foreignKeys = context.sqlite
      .prepare(`PRAGMA foreign_key_list(${tableName});`)
      .all() as unknown[];
    if (foreignKeys.length === 0) return true;
  }

  const constrainedTables = ["chat_auth_channel_defaults", "chat_auth_user_roles"];
  for (const tableName of constrainedTables) {
    const row = context.sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1;")
      .get(tableName) as { sql?: unknown } | undefined;
    const sql = String(row?.sql || "");
    if (!sql.includes("CHECK (channel IN")) return true;
  }

  return false;
}

/**
 * 重建旧版 chat authorization 表，保留仍然有效的数据。
 */
function rebuildChatAuthTables(context: ConsoleStoreContext): void {
  const roles = context.sqlite
    .prepare("SELECT role_id, name, description, created_at, updated_at FROM chat_auth_roles;")
    .all() as Array<Record<string, unknown>>;
  const rolePermissions = context.sqlite
    .prepare("SELECT role_id, permission, created_at FROM chat_auth_role_permissions;")
    .all() as Array<Record<string, unknown>>;
  const channelDefaults = context.sqlite
    .prepare("SELECT channel, role_id, created_at, updated_at FROM chat_auth_channel_defaults;")
    .all() as Array<Record<string, unknown>>;
  const userRoles = context.sqlite
    .prepare("SELECT channel, user_id, role_id, created_at, updated_at FROM chat_auth_user_roles;")
    .all() as Array<Record<string, unknown>>;
  const validRoleIds = new Set(
    roles.map((row) => String(row.role_id || "").trim()).filter(Boolean),
  );
  const validChannels = new Set(["telegram", "feishu", "qq"]);

  const tx = context.sqlite.transaction(() => {
    context.sqlite.exec(`
      DROP TABLE IF EXISTS chat_auth_role_permissions;
      DROP TABLE IF EXISTS chat_auth_channel_defaults;
      DROP TABLE IF EXISTS chat_auth_user_roles;
      DROP TABLE IF EXISTS chat_auth_roles;
    `);
    createChatAuthTables(context);

    const insertRole = context.sqlite.prepare(`
      INSERT OR IGNORE INTO chat_auth_roles (role_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?);
    `);
    for (const row of roles) {
      const roleId = String(row.role_id || "").trim();
      const name = String(row.name || "").trim();
      if (!roleId || !name) continue;
      insertRole.run(
        roleId,
        name,
        String(row.description || "").trim() || null,
        String(row.created_at || ""),
        String(row.updated_at || ""),
      );
    }

    const insertPermission = context.sqlite.prepare(`
      INSERT OR IGNORE INTO chat_auth_role_permissions (role_id, permission, created_at)
      VALUES (?, ?, ?);
    `);
    for (const row of rolePermissions) {
      const roleId = String(row.role_id || "").trim();
      const permission = String(row.permission || "").trim();
      if (!roleId || !permission || !validRoleIds.has(roleId)) continue;
      insertPermission.run(roleId, permission, String(row.created_at || ""));
    }

    const insertDefault = context.sqlite.prepare(`
      INSERT OR IGNORE INTO chat_auth_channel_defaults (channel, role_id, created_at, updated_at)
      VALUES (?, ?, ?, ?);
    `);
    for (const row of channelDefaults) {
      const channel = String(row.channel || "").trim();
      const roleId = String(row.role_id || "").trim();
      if (!validChannels.has(channel) || !validRoleIds.has(roleId)) continue;
      insertDefault.run(
        channel,
        roleId,
        String(row.created_at || ""),
        String(row.updated_at || ""),
      );
    }

    const insertUserRole = context.sqlite.prepare(`
      INSERT OR IGNORE INTO chat_auth_user_roles (channel, user_id, role_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?);
    `);
    for (const row of userRoles) {
      const channel = String(row.channel || "").trim();
      const userId = String(row.user_id || "").trim();
      const roleId = String(row.role_id || "").trim();
      if (!validChannels.has(channel) || !userId || !validRoleIds.has(roleId)) continue;
      insertUserRole.run(
        channel,
        userId,
        roleId,
        String(row.created_at || ""),
        String(row.updated_at || ""),
      );
    }
  });
  tx();
}

/**
 * 清理旧版 chat authorization key-value 存储。
 *
 * 关键点（中文）
 * - 新设计已经使用 `chat_auth_*` 结构化表。
 * - 旧的 `chat_authorization` / `agent:*:chat_authorization` 不再作为迁移来源。
 */
function removeLegacyChatAuthSecureSettings(context: ConsoleStoreContext): void {
  context.sqlite
    .prepare(
      `
      DELETE FROM console_secure_settings
      WHERE key = 'chat_authorization'
        OR key GLOB 'agent:*:chat_authorization';
      `,
    )
    .run();
}

/**
 * 初始化 Console 认证与授权表结构。
 *
 * 关键点（中文）
 * - 该 schema 属于 console 级全局能力，不依赖任何单个 agent 项目。
 * - V1 只建表与索引，不在这里写入默认数据，默认数据由 auth bootstrap 负责。
 */
function ensureAuthSchema(context: ConsoleStoreContext): void {
  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_users_username_uq
    ON auth_users(username);
  `);

  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_roles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_roles_name_uq
    ON auth_roles(name);
  `);

  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_permissions (
      id TEXT PRIMARY KEY NOT NULL,
      key TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_permissions_key_uq
    ON auth_permissions(key);
  `);

  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_user_roles (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_user_roles_user_role_uq
    ON auth_user_roles(user_id, role_id);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auth_user_roles_user_id_idx
    ON auth_user_roles(user_id);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auth_user_roles_role_id_idx
    ON auth_user_roles(role_id);
  `);

  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_role_permissions (
      id TEXT PRIMARY KEY NOT NULL,
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_role_permissions_role_permission_uq
    ON auth_role_permissions(role_id, permission_id);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auth_role_permissions_role_id_idx
    ON auth_role_permissions(role_id);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auth_role_permissions_permission_id_idx
    ON auth_role_permissions(permission_id);
  `);

  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT,
      revoked_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_tokens_token_hash_uq
    ON auth_tokens(token_hash);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auth_tokens_user_id_idx
    ON auth_tokens(user_id);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auth_tokens_expires_at_idx
    ON auth_tokens(expires_at);
  `);

  context.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      actor_user_id TEXT,
      actor_token_id TEXT,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      request_id TEXT,
      ip TEXT,
      user_agent TEXT,
      meta_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auth_audit_logs_actor_created_idx
    ON auth_audit_logs(actor_user_id, created_at);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auth_audit_logs_action_created_idx
    ON auth_audit_logs(action, created_at);
  `);
  context.sqlite.exec(`
    CREATE INDEX IF NOT EXISTS auth_audit_logs_resource_idx
    ON auth_audit_logs(resource_type, resource_id);
  `);
}

/**
 * 补齐 models 表的增量列。
 */
function ensureModelsTableColumns(context: ConsoleStoreContext): void {
  const rows = context.sqlite
    .prepare("PRAGMA table_info(models)")
    .all() as Array<{ name?: unknown }>;
  const columns = new Set(
    rows.map((row) => String(row.name || "").trim()).filter(Boolean),
  );
  if (!columns.has("is_paused")) {
    context.sqlite.exec(
      "ALTER TABLE models ADD COLUMN is_paused INTEGER NOT NULL DEFAULT 0;",
    );
  }
}

/**
 * 补齐 channel_accounts 表的增量列。
 */
function ensureChannelAccountsTableColumns(context: ConsoleStoreContext): void {
  const rows = context.sqlite
    .prepare("PRAGMA table_info(channel_accounts)")
    .all() as Array<{ name?: unknown }>;
  const columns = new Set(
    rows.map((row) => String(row.name || "").trim()).filter(Boolean),
  );
  if (!columns.has("owner")) {
    context.sqlite.exec("ALTER TABLE channel_accounts ADD COLUMN owner TEXT;");
  }
  if (!columns.has("creator")) {
    context.sqlite.exec("ALTER TABLE channel_accounts ADD COLUMN creator TEXT;");
  }
}

/**
 * 迁移历史 env 双表到统一单表。
 */
function ensureEnvEntriesMigration(context: ConsoleStoreContext): void {
  const envEntryColumns = context.sqlite
    .prepare("PRAGMA table_info(env_entries)")
    .all() as Array<{ name?: unknown }>;
  const envEntryColumnNames = new Set(
    envEntryColumns.map((row) => String(row.name || "").trim()).filter(Boolean),
  );
  if (!envEntryColumnNames.has("description")) {
    context.sqlite.exec("ALTER TABLE env_entries ADD COLUMN description TEXT;");
  }

  const tableRows = context.sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('global_env', 'agent_env');",
    )
    .all() as Array<{ name?: unknown }>;
  const tableNames = new Set(
    tableRows.map((row) => String(row.name || "").trim()).filter(Boolean),
  );
  if (tableNames.has("global_env")) {
    context.sqlite.exec(`
      INSERT OR IGNORE INTO env_entries (
        scope, agent_id, key, description, value_encrypted, created_at, updated_at
      )
      SELECT
        'global',
        '',
        key,
        NULL,
        value_encrypted,
        created_at,
        updated_at
      FROM global_env;
    `);
  }
  if (tableNames.has("agent_env")) {
    context.sqlite.exec(`
      INSERT OR IGNORE INTO env_entries (
        scope, agent_id, key, description, value_encrypted, created_at, updated_at
      )
      SELECT
        'agent',
        agent_id,
        key,
        NULL,
        value_encrypted,
        created_at,
        updated_at
      FROM agent_env;
    `);
    context.sqlite.exec(`
      UPDATE env_entries
      SET agent_id = ''
      WHERE scope = 'global' AND agent_id IS NULL;
    `);
  }
}
