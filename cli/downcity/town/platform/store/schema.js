/**
 * 平台存储表结构（drizzle schema）。
 */
import { index, integer, primaryKey, sqliteTable, text, } from "drizzle-orm/sqlite-core";
/**
 * 平台 Env 统一存储表。
 *
 * 关键点（中文）
 * - 当前只保留平台全局 env。
 * - 仍使用 `scope + agent_id + key` 复合主键，其中运行时固定写入 `global + ''`。
 * - value 采用密文存储，解密仅在运行时内存中进行。
 */
export const envEntriesTable = sqliteTable("env_entries", {
    scope: text("scope").notNull(),
    agentId: text("agent_id").notNull().default(""),
    key: text("key").notNull(),
    description: text("description"),
    valueEncrypted: text("value_encrypted").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
}, (table) => ({
    pk: primaryKey({
        columns: [table.scope, table.agentId, table.key],
        name: "env_entries_scope_agent_key_pk",
    }),
    scopeIdx: index("env_entries_scope_idx").on(table.scope),
    agentIdIdx: index("env_entries_agent_id_idx").on(table.agentId),
}));
/**
 * Channel Account 表。
 *
 * 关键点（中文）
 * - 各渠道敏感字段独立密文列存储。
 * - `downcity.json` 仅保存 channelAccountId 绑定，不直接保存密钥。
 */
export const channelAccountsTable = sqliteTable("channel_accounts", {
    id: text("id").primaryKey(),
    channel: text("channel").notNull(),
    name: text("name").notNull(),
    identity: text("identity"),
    owner: text("owner"),
    creator: text("creator"),
    botTokenEncrypted: text("bot_token_encrypted"),
    appIdEncrypted: text("app_id_encrypted"),
    appSecretEncrypted: text("app_secret_encrypted"),
    domain: text("domain"),
    sandbox: integer("sandbox"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
}, (table) => ({
    channelIdx: index("channel_accounts_channel_idx").on(table.channel),
}));
//# sourceMappingURL=schema.js.map