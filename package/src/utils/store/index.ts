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
  StoredModel,
  StoredModelProvider,
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
}
