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
 * Console 全局环境变量表。
 *
 * 关键点（中文）
 * - value 采用密文存储，解密仅在运行时内存中进行。
 * - key 全局唯一，作为主键。
 */
export const globalEnvTable = sqliteTable("global_env", {
  key: text("key").primaryKey(),
  valueEncrypted: text("value_encrypted").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Agent 私有环境变量表。
 *
 * 关键点（中文）
 * - 通过 `(agentId, key)` 复合主键隔离不同 agent。
 * - 用于注入单个 agent runtime，不参与全局共享解析。
 */
export const agentEnvTable = sqliteTable(
  "agent_env",
  {
    agentId: text("agent_id").notNull(),
    key: text("key").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.agentId, table.key],
      name: "agent_env_agent_key_pk",
    }),
    agentIdIdx: index("agent_env_agent_id_idx").on(table.agentId),
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
    authId: text("auth_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    channelIdx: index("channel_accounts_channel_idx").on(table.channel),
  }),
);
