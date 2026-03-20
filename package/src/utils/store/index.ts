/**
 * Console 模型存储（SQLite + Drizzle）。
 *
 * 关键点（中文）
 * - 数据文件：`~/.ship/ship.db`
 * - provider / model 配置统一落到 SQLite，不再依赖 ship.json 的 llm 节点。
 * - provider.apiKey 采用字段级加密存储。
 */
import fs from "fs-extra";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type {
  StoredEnvEntry,
  StoredEnvScope,
  StoredAgentEnvEntry,
  StoredChannelAccount,
  StoredChannelAccountChannel,
  StoredGlobalEnvEntry,
  StoredModel,
  StoredModelProvider,
  UpsertEnvEntryInput,
  UpsertAgentEnvEntryInput,
  UpsertChannelAccountInput,
  UpsertGlobalEnvEntryInput,
  UpsertModelInput,
  UpsertModelProviderInput,
} from "@/types/Store.js";
import {
  getConsoleRootDirPath,
  getConsoleShipDbPath,
} from "@/console/runtime/ConsolePaths.js";
import { decryptText, decryptTextSync, encryptText, encryptTextSync } from "./crypto.js";
import { modelProvidersTable, modelsTable } from "./schema.js";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeNonEmptyText(value: string, fieldName: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${fieldName} cannot be empty`);
  return normalized;
}

function optionalTrimmedText(value: string | undefined): string | undefined {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function normalizeChannelAccountChannel(input: string): StoredChannelAccountChannel {
  const channel = String(input || "").trim().toLowerCase();
  if (channel === "telegram" || channel === "feishu" || channel === "qq") {
    return channel;
  }
  throw new Error(`Unsupported channel account type: ${input}`);
}

/**
 * Console 模型存储。
 */
export class ConsoleStore {
  private readonly sqlite: Database.Database;

  private readonly db: ReturnType<typeof drizzle>;

  constructor(dbPath: string = getConsoleShipDbPath()) {
    fs.ensureDirSync(getConsoleRootDirPath());
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.db = drizzle(this.sqlite);
    this.ensureSchema();
  }

  /**
   * 创建基础表结构。
   */
  private ensureSchema(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS model_providers (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        base_url TEXT,
        api_key_encrypted TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.sqlite.exec(`
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
    this.ensureModelsTableColumns();
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS models_provider_id_idx
      ON models(provider_id);
    `);
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS console_secure_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value_encrypted TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS env_entries (
        scope TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT '',
        key TEXT NOT NULL,
        value_encrypted TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (scope, agent_id, key)
      );
    `);
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS env_entries_scope_idx
      ON env_entries(scope);
    `);
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS env_entries_agent_id_idx
      ON env_entries(agent_id);
    `);
    this.ensureEnvEntriesMigration();
    this.sqlite.exec(`
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
        auth_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS channel_accounts_channel_idx
      ON channel_accounts(channel);
    `);
    this.ensureChannelAccountsTableColumns();
  }

  /**
   * 补齐 models 表的增量列（轻量迁移）。
   *
   * 关键点（中文）
   * - 历史库可能不存在 `is_paused`，这里在启动时自动补齐。
   */
  private ensureModelsTableColumns(): void {
    const rows = this.sqlite
      .prepare("PRAGMA table_info(models)")
      .all() as Array<{ name?: unknown }>;
    const columns = new Set(
      rows.map((row) => String(row.name || "").trim()).filter(Boolean),
    );
    if (!columns.has("is_paused")) {
      this.sqlite.exec(
        "ALTER TABLE models ADD COLUMN is_paused INTEGER NOT NULL DEFAULT 0;",
      );
    }
  }

  /**
   * 补齐 channel_accounts 表的增量列（轻量迁移）。
   *
   * 关键点（中文）
   * - 历史库可能不存在 `owner`、`creator`，启动时自动补齐。
   */
  private ensureChannelAccountsTableColumns(): void {
    const rows = this.sqlite
      .prepare("PRAGMA table_info(channel_accounts)")
      .all() as Array<{ name?: unknown }>;
    const columns = new Set(
      rows.map((row) => String(row.name || "").trim()).filter(Boolean),
    );
    if (!columns.has("owner")) {
      this.sqlite.exec("ALTER TABLE channel_accounts ADD COLUMN owner TEXT;");
    }
    if (!columns.has("creator")) {
      this.sqlite.exec("ALTER TABLE channel_accounts ADD COLUMN creator TEXT;");
    }
  }

  /**
   * 关闭连接。
   */
  close(): void {
    this.sqlite.close();
  }

  /**
   * 列出 providers（包含解密后的 apiKey）。
   */
  async listProviders(): Promise<StoredModelProvider[]> {
    const rows = this.db.select().from(modelProvidersTable).all();
    const result: StoredModelProvider[] = [];
    for (const row of rows) {
      let apiKey: string | undefined;
      if (row.apiKeyEncrypted) {
        apiKey = await decryptText(row.apiKeyEncrypted);
      }
      result.push({
        id: row.id,
        type: row.type as StoredModelProvider["type"],
        baseUrl: row.baseUrl || undefined,
        apiKey,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
    return result;
  }

  /**
   * 获取单个 provider。
   */
  async getProvider(providerId: string): Promise<StoredModelProvider | null> {
    const row = this.db
      .select()
      .from(modelProvidersTable)
      .where(eq(modelProvidersTable.id, providerId))
      .get();
    if (!row) return null;
    let apiKey: string | undefined;
    if (row.apiKeyEncrypted) {
      apiKey = await decryptText(row.apiKeyEncrypted);
    }
    return {
      id: row.id,
      type: row.type as StoredModelProvider["type"],
      baseUrl: row.baseUrl || undefined,
      apiKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * 新增或更新 provider。
   */
  async upsertProvider(input: UpsertModelProviderInput): Promise<void> {
    const id = String(input.id || "").trim();
    if (!id) throw new Error("providerId cannot be empty");

    const existing = this.db
      .select()
      .from(modelProvidersTable)
      .where(eq(modelProvidersTable.id, id))
      .get();
    const createdAt = existing?.createdAt || nowIso();
    const updatedAt = nowIso();
    const hasApiKeyField = Object.prototype.hasOwnProperty.call(input, "apiKey");
    let apiKeyEncrypted: string | null = existing?.apiKeyEncrypted || null;
    if (hasApiKeyField) {
      if (typeof input.apiKey === "string" && input.apiKey.length > 0) {
        apiKeyEncrypted = await encryptText(input.apiKey);
      } else {
        apiKeyEncrypted = null;
      }
    }

    this.db
      .insert(modelProvidersTable)
      .values({
        id,
        type: input.type,
        baseUrl: input.baseUrl || null,
        apiKeyEncrypted,
        createdAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: modelProvidersTable.id,
        set: {
          type: input.type,
          baseUrl: input.baseUrl || null,
          apiKeyEncrypted,
          updatedAt,
        },
      })
      .run();
  }

  /**
   * 删除 provider（若被 model 引用会抛错）。
   */
  removeProvider(providerId: string): void {
    const refs = this.db
      .select()
      .from(modelsTable)
      .where(eq(modelsTable.providerId, providerId))
      .all();
    if (refs.length > 0) {
      throw new Error(
        `Provider "${providerId}" is referenced by models: ${refs.map((x) => x.id).join(", ")}`,
      );
    }
    this.db
      .delete(modelProvidersTable)
      .where(eq(modelProvidersTable.id, providerId))
      .run();
  }

  /**
   * 列出 models。
   */
  listModels(): StoredModel[] {
    const rows = this.db.select().from(modelsTable).all();
    return rows.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      name: row.name,
      temperature: row.temperature ?? undefined,
      maxTokens: row.maxTokens ?? undefined,
      topP: row.topP ?? undefined,
      frequencyPenalty: row.frequencyPenalty ?? undefined,
      presencePenalty: row.presencePenalty ?? undefined,
      anthropicVersion: row.anthropicVersion ?? undefined,
      isPaused: Number(row.isPaused || 0) === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * 获取单个 model。
   */
  getModel(modelId: string): StoredModel | null {
    const row = this.db
      .select()
      .from(modelsTable)
      .where(eq(modelsTable.id, modelId))
      .get();
    if (!row) return null;
    return {
      id: row.id,
      providerId: row.providerId,
      name: row.name,
      temperature: row.temperature ?? undefined,
      maxTokens: row.maxTokens ?? undefined,
      topP: row.topP ?? undefined,
      frequencyPenalty: row.frequencyPenalty ?? undefined,
      presencePenalty: row.presencePenalty ?? undefined,
      anthropicVersion: row.anthropicVersion ?? undefined,
      isPaused: Number(row.isPaused || 0) === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * 新增或更新 model。
   */
  upsertModel(input: UpsertModelInput): void {
    const id = String(input.id || "").trim();
    if (!id) throw new Error("modelId cannot be empty");
    const providerId = String(input.providerId || "").trim();
    if (!providerId) throw new Error("providerId cannot be empty");
    const provider = this.db
      .select()
      .from(modelProvidersTable)
      .where(eq(modelProvidersTable.id, providerId))
      .get();
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    const existing = this.db
      .select()
      .from(modelsTable)
      .where(eq(modelsTable.id, id))
      .get();
    const createdAt = existing?.createdAt || nowIso();
    const updatedAt = nowIso();

    this.db
      .insert(modelsTable)
      .values({
        id,
        providerId,
        name: input.name,
        temperature: input.temperature ?? null,
        maxTokens: input.maxTokens ?? null,
        topP: input.topP ?? null,
        frequencyPenalty: input.frequencyPenalty ?? null,
        presencePenalty: input.presencePenalty ?? null,
        anthropicVersion: input.anthropicVersion ?? null,
        isPaused: input.isPaused === true ? 1 : 0,
        createdAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: modelsTable.id,
        set: {
          providerId,
          name: input.name,
          temperature: input.temperature ?? null,
          maxTokens: input.maxTokens ?? null,
          topP: input.topP ?? null,
          frequencyPenalty: input.frequencyPenalty ?? null,
          presencePenalty: input.presencePenalty ?? null,
          anthropicVersion: input.anthropicVersion ?? null,
          isPaused: input.isPaused === true ? 1 : 0,
          updatedAt,
        },
      })
      .run();
  }

  /**
   * 切换模型暂停状态。
   */
  setModelPaused(modelId: string, paused: boolean): void {
    const id = String(modelId || "").trim();
    if (!id) throw new Error("modelId cannot be empty");
    const current = this.getModel(id);
    if (!current) throw new Error(`Model not found: ${id}`);
    this.db
      .update(modelsTable)
      .set({
        isPaused: paused ? 1 : 0,
        updatedAt: nowIso(),
      })
      .where(eq(modelsTable.id, id))
      .run();
  }

  /**
   * 删除 model。
   */
  removeModel(modelId: string): void {
    this.db.delete(modelsTable).where(eq(modelsTable.id, modelId)).run();
  }

  /**
   * 按 modelId 获取“模型 + provider”聚合信息。
   */
  async getResolvedModel(modelId: string): Promise<{
    model: StoredModel;
    provider: StoredModelProvider;
  } | null> {
    const model = this.getModel(modelId);
    if (!model) return null;
    const provider = await this.getProvider(model.providerId);
    if (!provider) return null;
    return { model, provider };
  }

  /**
   * 清空模型池（仅内部迁移/初始化使用）。
   */
  clearAll(): void {
    this.sqlite.exec("DELETE FROM models;");
    this.sqlite.exec("DELETE FROM model_providers;");
    this.sqlite.exec("DELETE FROM console_secure_settings;");
    this.sqlite.exec("DELETE FROM global_env;");
    this.sqlite.exec("DELETE FROM agent_env;");
    this.sqlite.exec("DELETE FROM channel_accounts;");
  }

  /**
   * 同步读取 console 加密配置项（JSON）。
   */
  getSecureSettingJsonSync<T>(key: string): T | null {
    const settingKey = String(key || "").trim();
    if (!settingKey) throw new Error("setting key cannot be empty");
    const row = this.sqlite
      .prepare(
        "SELECT value_encrypted FROM console_secure_settings WHERE key = ? LIMIT 1;",
      )
      .get(settingKey) as { value_encrypted?: unknown } | undefined;
    if (!row || typeof row.value_encrypted !== "string" || !row.value_encrypted) {
      return null;
    }
    const raw = decryptTextSync(row.value_encrypted);
    return JSON.parse(raw) as T;
  }

  /**
   * 同步写入 console 加密配置项（JSON）。
   */
  setSecureSettingJsonSync(key: string, value: unknown): void {
    const settingKey = String(key || "").trim();
    if (!settingKey) throw new Error("setting key cannot be empty");
    const raw = JSON.stringify(value ?? null);
    const encrypted = encryptTextSync(raw);
    const now = nowIso();
    this.sqlite
      .prepare(
        `
        INSERT INTO console_secure_settings (key, value_encrypted, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_encrypted = excluded.value_encrypted,
          updated_at = excluded.updated_at;
        `,
      )
      .run(settingKey, encrypted, now, now);
  }

  /**
   * 删除 console 加密配置项。
   */
  removeSecureSetting(key: string): void {
    const settingKey = String(key || "").trim();
    if (!settingKey) throw new Error("setting key cannot be empty");
    this.sqlite
      .prepare("DELETE FROM console_secure_settings WHERE key = ?;")
      .run(settingKey);
  }

  /**
   * 异步读取 console 加密配置项（JSON）。
   */
  async getSecureSettingJson<T>(key: string): Promise<T | null> {
    const settingKey = String(key || "").trim();
    if (!settingKey) throw new Error("setting key cannot be empty");
    const row = this.sqlite
      .prepare(
        "SELECT value_encrypted FROM console_secure_settings WHERE key = ? LIMIT 1;",
      )
      .get(settingKey) as { value_encrypted?: unknown } | undefined;
    if (!row || typeof row.value_encrypted !== "string" || !row.value_encrypted) {
      return null;
    }
    const raw = await decryptText(row.value_encrypted);
    return JSON.parse(raw) as T;
  }

  /**
   * 异步写入 console 加密配置项（JSON）。
   */
  async setSecureSettingJson(key: string, value: unknown): Promise<void> {
    const settingKey = String(key || "").trim();
    if (!settingKey) throw new Error("setting key cannot be empty");
    const raw = JSON.stringify(value ?? null);
    const encrypted = await encryptText(raw);
    const now = nowIso();
    this.sqlite
      .prepare(
        `
        INSERT INTO console_secure_settings (key, value_encrypted, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_encrypted = excluded.value_encrypted,
          updated_at = excluded.updated_at;
        `,
      )
      .run(settingKey, encrypted, now, now);
  }

  /**
   * 读取 console extensions 配置（同步）。
   */
  getExtensionsConfigSync<T extends object>(): T | null {
    return this.getSecureSettingJsonSync<T>("extensions_config");
  }

  /**
   * 写入 console extensions 配置（同步）。
   */
  setExtensionsConfigSync(value: unknown): void {
    this.setSecureSettingJsonSync("extensions_config", value);
  }

  /**
   * 迁移历史 env 双表到统一单表 `env_entries`。
   *
   * 关键点（中文）
   * - 历史版本使用 `global_env` 与 `agent_env` 分表。
   * - 新版本统一写入 `env_entries`，启动时自动迁移旧数据。
   * - 旧表保留不删，避免用户本地调试或回滚时直接丢失数据。
   */
  private ensureEnvEntriesMigration(): void {
    const tableRows = this.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('global_env', 'agent_env');",
      )
      .all() as Array<{ name?: unknown }>;
    const tableNames = new Set(
      tableRows.map((row) => String(row.name || "").trim()).filter(Boolean),
    );
    if (tableNames.has("global_env")) {
      this.sqlite.exec(`
        INSERT OR IGNORE INTO env_entries (
          scope, agent_id, key, value_encrypted, created_at, updated_at
        )
        SELECT
          'global',
          '',
          key,
          value_encrypted,
          created_at,
          updated_at
        FROM global_env;
      `);
    }
    if (tableNames.has("agent_env")) {
      this.sqlite.exec(`
        INSERT OR IGNORE INTO env_entries (
          scope, agent_id, key, value_encrypted, created_at, updated_at
        )
        SELECT
          'agent',
          agent_id,
          key,
          value_encrypted,
          created_at,
          updated_at
        FROM agent_env;
      `);
      this.sqlite.exec(`
        UPDATE env_entries
        SET agent_id = ''
        WHERE scope = 'global' AND agent_id IS NULL;
      `);
    }
  }

  /**
   * 规范化 env scope。
   */
  private normalizeEnvScope(input: string): StoredEnvScope {
    const scope = String(input || "").trim().toLowerCase();
    if (scope === "agent") return "agent";
    return "global";
  }

  /**
   * 规范化 env 的 agent 目标。
   *
   * 关键点（中文）
   * - `global` 固定为空字符串，统一作为单表中的全局占位值。
   * - `agent` 必须是非空 projectRoot。
   */
  private normalizeEnvAgentTarget(scope: StoredEnvScope, agentIdInput?: string): string {
    if (scope === "global") return "";
    return normalizeNonEmptyText(agentIdInput || "", "agentId");
  }

  /**
   * 解密并格式化 env 行。
   */
  private buildEnvEntryFromRowSync(row: {
    scope?: unknown;
    agent_id?: unknown;
    key?: unknown;
    value_encrypted?: unknown;
    created_at?: unknown;
    updated_at?: unknown;
  }): StoredEnvEntry | null {
    const scope = this.normalizeEnvScope(String(row.scope || ""));
    const agentId = String(row.agent_id || "").trim();
    const key = String(row.key || "").trim();
    const encrypted = typeof row.value_encrypted === "string" ? row.value_encrypted : "";
    if (!key || !encrypted) return null;
    return {
      scope,
      agentId: scope === "agent" ? agentId : undefined,
      key,
      value: decryptTextSync(encrypted),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    };
  }

  /**
   * 解密并格式化 env 行（异步）。
   */
  private async buildEnvEntryFromRow(row: {
    scope?: unknown;
    agent_id?: unknown;
    key?: unknown;
    value_encrypted?: unknown;
    created_at?: unknown;
    updated_at?: unknown;
  }): Promise<StoredEnvEntry | null> {
    const scope = this.normalizeEnvScope(String(row.scope || ""));
    const agentId = String(row.agent_id || "").trim();
    const key = String(row.key || "").trim();
    const encrypted = typeof row.value_encrypted === "string" ? row.value_encrypted : "";
    if (!key || !encrypted) return null;
    return {
      scope,
      agentId: scope === "agent" ? agentId : undefined,
      key,
      value: await decryptText(encrypted),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    };
  }

  /**
   * 查询 env 条目（同步）。
   */
  listEnvEntriesSync(scopeInput?: StoredEnvScope, agentIdInput?: string): StoredEnvEntry[] {
    const hasScope = Boolean(scopeInput);
    const scope = hasScope ? this.normalizeEnvScope(scopeInput || "global") : undefined;
    const hasAgentFilter = scope === "agent" && Boolean(String(agentIdInput || "").trim());
    const agentId = hasAgentFilter
      ? this.normalizeEnvAgentTarget(scope, agentIdInput)
      : undefined;
    const rows = hasAgentFilter
      ? this.sqlite.prepare(
          `
          SELECT scope, agent_id, key, value_encrypted, created_at, updated_at
          FROM env_entries
          WHERE scope = 'agent' AND agent_id = ?
          ORDER BY key ASC;
          `,
        ).all(agentId)
      : scope === "agent"
        ? this.sqlite.prepare(
            `
            SELECT scope, agent_id, key, value_encrypted, created_at, updated_at
            FROM env_entries
            WHERE scope = 'agent'
            ORDER BY agent_id ASC, key ASC;
            `,
          ).all()
        : scope === "global"
        ? this.sqlite.prepare(
            `
            SELECT scope, agent_id, key, value_encrypted, created_at, updated_at
            FROM env_entries
            WHERE scope = 'global'
            ORDER BY key ASC;
            `,
          ).all()
        : this.sqlite.prepare(
            `
            SELECT scope, agent_id, key, value_encrypted, created_at, updated_at
            FROM env_entries
            ORDER BY scope ASC, agent_id ASC, key ASC;
            `,
          ).all();
    const out: StoredEnvEntry[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const entry = this.buildEnvEntryFromRowSync(row);
      if (entry) out.push(entry);
    }
    return out;
  }

  /**
   * 查询 env 条目（异步）。
   */
  async listEnvEntries(scopeInput?: StoredEnvScope, agentIdInput?: string): Promise<StoredEnvEntry[]> {
    const hasScope = Boolean(scopeInput);
    const scope = hasScope ? this.normalizeEnvScope(scopeInput || "global") : undefined;
    const hasAgentFilter = scope === "agent" && Boolean(String(agentIdInput || "").trim());
    const agentId = hasAgentFilter
      ? this.normalizeEnvAgentTarget(scope, agentIdInput)
      : undefined;
    const rows = hasAgentFilter
      ? this.sqlite.prepare(
          `
          SELECT scope, agent_id, key, value_encrypted, created_at, updated_at
          FROM env_entries
          WHERE scope = 'agent' AND agent_id = ?
          ORDER BY key ASC;
          `,
        ).all(agentId)
      : scope === "agent"
        ? this.sqlite.prepare(
            `
            SELECT scope, agent_id, key, value_encrypted, created_at, updated_at
            FROM env_entries
            WHERE scope = 'agent'
            ORDER BY agent_id ASC, key ASC;
            `,
          ).all()
        : scope === "global"
        ? this.sqlite.prepare(
            `
            SELECT scope, agent_id, key, value_encrypted, created_at, updated_at
            FROM env_entries
            WHERE scope = 'global'
            ORDER BY key ASC;
            `,
          ).all()
        : this.sqlite.prepare(
            `
            SELECT scope, agent_id, key, value_encrypted, created_at, updated_at
            FROM env_entries
            ORDER BY scope ASC, agent_id ASC, key ASC;
            `,
          ).all();
    const out: StoredEnvEntry[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const entry = await this.buildEnvEntryFromRow(row);
      if (entry) out.push(entry);
    }
    return out;
  }

  /**
   * 新增或更新 env 条目。
   */
  async upsertEnvEntry(input: UpsertEnvEntryInput): Promise<void> {
    const scope = this.normalizeEnvScope(input.scope);
    const agentId = this.normalizeEnvAgentTarget(scope, input.agentId);
    const key = normalizeNonEmptyText(input.key, `${scope} env key`);
    const value = String(input.value ?? "");
    const existing = this.sqlite.prepare(
      `
      SELECT created_at
      FROM env_entries
      WHERE scope = ? AND agent_id = ? AND key = ?
      LIMIT 1;
      `,
    ).get(scope, agentId, key) as { created_at?: unknown } | undefined;
    const createdAt = String(existing?.created_at || nowIso());
    const updatedAt = nowIso();
    const encrypted = await encryptText(value);
    this.sqlite.prepare(
      `
      INSERT INTO env_entries (scope, agent_id, key, value_encrypted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, agent_id, key) DO UPDATE SET
        value_encrypted = excluded.value_encrypted,
        updated_at = excluded.updated_at;
      `,
    ).run(scope, agentId, key, encrypted, createdAt, updatedAt);
  }

  /**
   * 删除单个 env 条目。
   */
  removeEnvEntry(input: { scope: StoredEnvScope; agentId?: string; key: string }): void {
    const scope = this.normalizeEnvScope(input.scope);
    const agentId = this.normalizeEnvAgentTarget(scope, input.agentId);
    const key = normalizeNonEmptyText(input.key, `${scope} env key`);
    this.sqlite
      .prepare("DELETE FROM env_entries WHERE scope = ? AND agent_id = ? AND key = ?;")
      .run(scope, agentId, key);
  }

  /**
   * 列出全局环境变量（同步解密）。
   */
  listGlobalEnvEntriesSync(): StoredGlobalEnvEntry[] {
    return this.listEnvEntriesSync("global");
  }

  /**
   * 读取全局环境变量映射（同步解密）。
   */
  getGlobalEnvMapSync(): Record<string, string> {
    const entries = this.listGlobalEnvEntriesSync();
    const map: Record<string, string> = {};
    for (const item of entries) {
      map[item.key] = item.value;
    }
    return map;
  }

  /**
   * 列出全局环境变量（解密后）。
   */
  async listGlobalEnvEntries(): Promise<StoredGlobalEnvEntry[]> {
    return this.listEnvEntries("global");
  }

  /**
   * 读取全局环境变量映射（解密后）。
   */
  async getGlobalEnvMap(): Promise<Record<string, string>> {
    const entries = await this.listGlobalEnvEntries();
    const map: Record<string, string> = {};
    for (const item of entries) {
      map[item.key] = item.value;
    }
    return map;
  }

  /**
   * 新增或更新全局环境变量。
   */
  async upsertGlobalEnvEntry(input: UpsertGlobalEnvEntryInput): Promise<void> {
    await this.upsertEnvEntry({
      scope: "global",
      key: input.key,
      value: input.value,
    });
  }

  /**
   * 删除单个全局环境变量。
   */
  removeGlobalEnvEntry(keyInput: string): void {
    this.removeEnvEntry({
      scope: "global",
      key: keyInput,
    });
  }

  /**
   * 清空全局环境变量。
   */
  clearGlobalEnvEntries(): void {
    this.sqlite.prepare("DELETE FROM env_entries WHERE scope = 'global';").run();
  }

  /**
   * 列出指定 agent 的私有环境变量（同步解密）。
   */
  listAgentEnvEntriesSync(agentIdInput: string): StoredAgentEnvEntry[] {
    return this.listEnvEntriesSync("agent", agentIdInput);
  }

  /**
   * 读取指定 agent 的私有环境变量映射（同步解密）。
   */
  getAgentEnvMapSync(agentIdInput: string): Record<string, string> {
    const entries = this.listAgentEnvEntriesSync(agentIdInput);
    const map: Record<string, string> = {};
    for (const item of entries) {
      map[item.key] = item.value;
    }
    return map;
  }

  /**
   * 列出指定 agent 的私有环境变量（解密后）。
   */
  async listAgentEnvEntries(agentIdInput: string): Promise<StoredAgentEnvEntry[]> {
    return this.listEnvEntries("agent", agentIdInput);
  }

  /**
   * 列出全部 agent 私有环境变量（解密后）。
   *
   * 关键点（中文）
   * - 用于 Console UI 的全局 Env 工作台，不依赖当前选中的 agent。
   * - 返回结果按 agentId、key 排序，便于前端稳定分组展示。
   */
  async listAllAgentEnvEntries(): Promise<StoredAgentEnvEntry[]> {
    return this.listEnvEntries("agent");
  }

  /**
   * 读取指定 agent 的私有环境变量映射（解密后）。
   */
  async getAgentEnvMap(agentIdInput: string): Promise<Record<string, string>> {
    const entries = await this.listAgentEnvEntries(agentIdInput);
    const map: Record<string, string> = {};
    for (const item of entries) {
      map[item.key] = item.value;
    }
    return map;
  }

  /**
   * 新增或更新 agent 私有环境变量。
   */
  async upsertAgentEnvEntry(input: UpsertAgentEnvEntryInput): Promise<void> {
    await this.upsertEnvEntry({
      scope: "agent",
      agentId: input.agentId,
      key: input.key,
      value: input.value,
    });
  }

  /**
   * 删除指定 agent 的单个环境变量。
   */
  removeAgentEnvEntry(agentIdInput: string, keyInput: string): void {
    this.removeEnvEntry({
      scope: "agent",
      agentId: agentIdInput,
      key: keyInput,
    });
  }

  /**
   * 清空指定 agent 的私有环境变量。
   */
  clearAgentEnvEntries(agentIdInput: string): void {
    const agentId = normalizeNonEmptyText(agentIdInput, "agentId");
    this.sqlite
      .prepare("DELETE FROM env_entries WHERE scope = 'agent' AND agent_id = ?;")
      .run(agentId);
  }

  /**
   * 列出 channel accounts（同步解密）。
   */
  listChannelAccountsSync(channelInput?: string): StoredChannelAccount[] {
    const maybeChannel = optionalTrimmedText(channelInput);
    const rows = maybeChannel
      ? this.sqlite.prepare(
          `
          SELECT
            id, channel, name, identity, owner, creator,
            bot_token_encrypted, app_id_encrypted, app_secret_encrypted,
            domain, sandbox, auth_id, created_at, updated_at
          FROM channel_accounts
          WHERE channel = ?
          ORDER BY name ASC, id ASC;
          `,
        ).all(maybeChannel)
      : this.sqlite.prepare(
          `
          SELECT
            id, channel, name, identity, owner, creator,
            bot_token_encrypted, app_id_encrypted, app_secret_encrypted,
            domain, sandbox, auth_id, created_at, updated_at
          FROM channel_accounts
          ORDER BY channel ASC, name ASC, id ASC;
          `,
        ).all();
    const out: StoredChannelAccount[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      const channel = normalizeChannelAccountChannel(String(row.channel || ""));
      const botTokenEncrypted =
        typeof row.bot_token_encrypted === "string" ? row.bot_token_encrypted : "";
      const appIdEncrypted =
        typeof row.app_id_encrypted === "string" ? row.app_id_encrypted : "";
      const appSecretEncrypted =
        typeof row.app_secret_encrypted === "string" ? row.app_secret_encrypted : "";
      const botToken = botTokenEncrypted ? decryptTextSync(botTokenEncrypted) : undefined;
      const appId = appIdEncrypted ? decryptTextSync(appIdEncrypted) : undefined;
      const appSecret = appSecretEncrypted ? decryptTextSync(appSecretEncrypted) : undefined;
      out.push({
        id,
        channel,
        name: String(row.name || "").trim() || id,
        identity: optionalTrimmedText(String(row.identity || "")),
        owner: optionalTrimmedText(String(row.owner || "")),
        creator: optionalTrimmedText(String(row.creator || "")),
        botToken: optionalTrimmedText(botToken),
        appId: optionalTrimmedText(appId),
        appSecret: optionalTrimmedText(appSecret),
        domain: optionalTrimmedText(String(row.domain || "")),
        sandbox: Number(row.sandbox || 0) === 1,
        authId: optionalTrimmedText(String(row.auth_id || "")),
        createdAt: String(row.created_at || ""),
        updatedAt: String(row.updated_at || ""),
      });
    }
    return out;
  }

  /**
   * 按 ID 获取 channel account（同步解密）。
   */
  getChannelAccountSync(accountIdInput: string): StoredChannelAccount | null {
    const accountId = normalizeNonEmptyText(accountIdInput, "channel account id");
    const rows = this.listChannelAccountsSync();
    return rows.find((item) => item.id === accountId) || null;
  }

  /**
   * 列出 channel accounts（解密后）。
   */
  async listChannelAccounts(channelInput?: string): Promise<StoredChannelAccount[]> {
    const maybeChannel = optionalTrimmedText(channelInput);
    const rows = maybeChannel
      ? this.sqlite.prepare(
          `
          SELECT
            id, channel, name, identity, owner, creator,
            bot_token_encrypted, app_id_encrypted, app_secret_encrypted,
            domain, sandbox, auth_id, created_at, updated_at
          FROM channel_accounts
          WHERE channel = ?
          ORDER BY name ASC, id ASC;
          `,
        ).all(maybeChannel)
      : this.sqlite.prepare(
          `
          SELECT
            id, channel, name, identity, owner, creator,
            bot_token_encrypted, app_id_encrypted, app_secret_encrypted,
            domain, sandbox, auth_id, created_at, updated_at
          FROM channel_accounts
          ORDER BY channel ASC, name ASC, id ASC;
          `,
        ).all();
    const out: StoredChannelAccount[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      const channel = normalizeChannelAccountChannel(String(row.channel || ""));
      const botTokenEncrypted =
        typeof row.bot_token_encrypted === "string" ? row.bot_token_encrypted : "";
      const appIdEncrypted =
        typeof row.app_id_encrypted === "string" ? row.app_id_encrypted : "";
      const appSecretEncrypted =
        typeof row.app_secret_encrypted === "string" ? row.app_secret_encrypted : "";
      const botToken = botTokenEncrypted ? await decryptText(botTokenEncrypted) : undefined;
      const appId = appIdEncrypted ? await decryptText(appIdEncrypted) : undefined;
      const appSecret = appSecretEncrypted ? await decryptText(appSecretEncrypted) : undefined;
      out.push({
        id,
        channel,
        name: String(row.name || "").trim() || id,
        identity: optionalTrimmedText(String(row.identity || "")),
        owner: optionalTrimmedText(String(row.owner || "")),
        creator: optionalTrimmedText(String(row.creator || "")),
        botToken: optionalTrimmedText(botToken),
        appId: optionalTrimmedText(appId),
        appSecret: optionalTrimmedText(appSecret),
        domain: optionalTrimmedText(String(row.domain || "")),
        sandbox: Number(row.sandbox || 0) === 1,
        authId: optionalTrimmedText(String(row.auth_id || "")),
        createdAt: String(row.created_at || ""),
        updatedAt: String(row.updated_at || ""),
      });
    }
    return out;
  }

  /**
   * 按 ID 获取 channel account（解密后）。
   */
  async getChannelAccount(accountIdInput: string): Promise<StoredChannelAccount | null> {
    const accountId = normalizeNonEmptyText(accountIdInput, "channel account id");
    const rows = await this.listChannelAccounts();
    return rows.find((item) => item.id === accountId) || null;
  }

  /**
   * 新增或更新 channel account。
   */
  async upsertChannelAccount(input: UpsertChannelAccountInput): Promise<void> {
    const id = normalizeNonEmptyText(input.id, "channel account id");
    const channel = normalizeChannelAccountChannel(input.channel);
    const name = normalizeNonEmptyText(input.name, "channel account name");
    const existing = await this.getChannelAccount(id);
    const createdAt = existing?.createdAt || nowIso();
    const updatedAt = nowIso();

    const nextBotToken =
      Object.prototype.hasOwnProperty.call(input, "botToken")
        ? optionalTrimmedText(input.botToken)
        : existing?.botToken;
    const nextAppId =
      Object.prototype.hasOwnProperty.call(input, "appId")
        ? optionalTrimmedText(input.appId)
        : existing?.appId;
    const nextAppSecret =
      Object.prototype.hasOwnProperty.call(input, "appSecret")
        ? optionalTrimmedText(input.appSecret)
        : existing?.appSecret;
    const botTokenEncrypted = nextBotToken ? await encryptText(nextBotToken) : null;
    const appIdEncrypted = nextAppId ? await encryptText(nextAppId) : null;
    const appSecretEncrypted = nextAppSecret ? await encryptText(nextAppSecret) : null;

    this.sqlite.prepare(
      `
      INSERT INTO channel_accounts (
        id, channel, name, identity, owner, creator,
        bot_token_encrypted, app_id_encrypted, app_secret_encrypted,
        domain, sandbox, auth_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        channel = excluded.channel,
        name = excluded.name,
        identity = excluded.identity,
        owner = excluded.owner,
        creator = excluded.creator,
        bot_token_encrypted = excluded.bot_token_encrypted,
        app_id_encrypted = excluded.app_id_encrypted,
        app_secret_encrypted = excluded.app_secret_encrypted,
        domain = excluded.domain,
        sandbox = excluded.sandbox,
        auth_id = excluded.auth_id,
        updated_at = excluded.updated_at;
      `,
    ).run(
      id,
      channel,
      name,
      optionalTrimmedText(input.identity) || null,
      optionalTrimmedText(input.owner) || null,
      optionalTrimmedText(input.creator) || null,
      botTokenEncrypted,
      appIdEncrypted,
      appSecretEncrypted,
      optionalTrimmedText(input.domain) || null,
      input.sandbox === true ? 1 : 0,
      optionalTrimmedText(input.authId) || null,
      createdAt,
      updatedAt,
    );
  }

  /**
   * 删除 channel account。
   */
  removeChannelAccount(accountIdInput: string): void {
    const accountId = normalizeNonEmptyText(accountIdInput, "channel account id");
    this.sqlite.prepare("DELETE FROM channel_accounts WHERE id = ?;").run(accountId);
  }
}
