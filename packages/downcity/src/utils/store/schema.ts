/**
 * 模型存储表结构（drizzle schema）。
 *
 * 关键点（中文）
 * - providers 与 models 分表，使用 providerId 做关联。
 * - API Key 以密文字段存储（`apiKeyEncrypted`）。
 */
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const modelProvidersTable = sqliteTable("model_providers", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  baseUrl: text("base_url"),
  apiKeyEncrypted: text("api_key_encrypted"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const modelsTable = sqliteTable(
  "models",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull(),
    name: text("name").notNull(),
    temperature: real("temperature"),
    maxTokens: integer("max_tokens"),
    topP: real("top_p"),
    frequencyPenalty: real("frequency_penalty"),
    presencePenalty: real("presence_penalty"),
    anthropicVersion: text("anthropic_version"),
    isPaused: integer("is_paused").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    providerIdIdx: index("models_provider_id_idx").on(table.providerId),
  }),
);

/**
 * Console Env 统一存储表。
 *
 * 关键点（中文）
 * - 全局 env 与 agent env 共用一张表，通过 `scope` + `agentId` 区分。
 * - `agentId` 在 `scope=global` 时固定为空字符串，避免 SQLite 复合主键中的 NULL 语义问题。
 * - value 采用密文存储，解密仅在运行时内存中进行。
 */
export const envEntriesTable = sqliteTable(
  "env_entries",
  {
    scope: text("scope").notNull(),
    agentId: text("agent_id").notNull().default(""),
    key: text("key").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.scope, table.agentId, table.key],
      name: "env_entries_scope_agent_key_pk",
    }),
    scopeIdx: index("env_entries_scope_idx").on(table.scope),
    agentIdIdx: index("env_entries_agent_id_idx").on(table.agentId),
  }),
);

/**
 * Channel Account 表。
 *
 * 关键点（中文）
 * - 各渠道敏感字段独立密文列存储。
 * - `ship.json` 仅保存 channelAccountId 绑定，不直接保存密钥。
 */
export const channelAccountsTable = sqliteTable(
  "channel_accounts",
  {
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
  },
  (table) => ({
    channelIdx: index("channel_accounts_channel_idx").on(table.channel),
  }),
);
