/**
 * 模型存储表结构（drizzle schema）。
 *
 * 关键点（中文）
 * - providers 与 models 分表，使用 providerId 做关联。
 * - API Key 以密文字段存储（`apiKeyEncrypted`）。
 */
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
