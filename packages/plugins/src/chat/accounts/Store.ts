/**
 * Channel account 默认存储实现。
 *
 * 职责说明（中文）
 * - 提供 `chat` plugin 默认使用的全局 channel account 读写能力。
 * - 默认直接操作 `~/.downcity/downcity.db` 里的 `channel_accounts` 表。
 * - 对 `city` 而言，这里也是统一的默认账号池实现来源。
 *
 * 边界说明（中文）
 * - 这里只负责 channel account 这一个表，不扩展成通用平台数据库门面。
 * - 模型池、env、其他平台级配置仍由各自模块独立管理。
 */

import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "node:path";
import { getPlatformStoreDbPath } from "@downcity/agent/internal/config/PlatformPaths.js";
import { decryptTextSync, encryptTextSync } from "./Crypto.js";
import type {
  StoredChannelAccount,
  StoredChannelAccountChannel,
  UpsertChannelAccountInput,
} from "@downcity/agent/internal/types/platform/Store.js";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeNonEmptyText(value: string, fieldName: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  return normalized;
}

function optionalTrimmedText(value: string | undefined): string | undefined {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

/**
 * 规范化 channel 类型。
 */
export function normalizeChannelAccountChannel(
  input: string,
): StoredChannelAccountChannel {
  const channel = String(input || "").trim().toLowerCase();
  if (channel === "telegram" || channel === "feishu" || channel === "qq") {
    return channel;
  }
  throw new Error(`Unsupported channel account type: ${input}`);
}

function ensureChannelAccountSchema(database: Database.Database): void {
  database.exec(`
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
  database.exec(`
    CREATE INDEX IF NOT EXISTS channel_accounts_channel_idx
    ON channel_accounts(channel);
  `);

  const rows = database
    .prepare("PRAGMA table_info(channel_accounts)")
    .all() as Array<{ name?: unknown }>;
  const columns = new Set(
    rows.map((row) => String(row.name || "").trim()).filter(Boolean),
  );
  if (!columns.has("owner")) {
    database.exec("ALTER TABLE channel_accounts ADD COLUMN owner TEXT;");
  }
  if (!columns.has("creator")) {
    database.exec("ALTER TABLE channel_accounts ADD COLUMN creator TEXT;");
  }
}

function withChannelAccountDb<T>(callback: (database: Database.Database) => T): T {
  const dbPath = getPlatformStoreDbPath();
  fs.ensureDirSync(path.dirname(dbPath));
  const database = new Database(dbPath);
  try {
    database.pragma("journal_mode = WAL");
    ensureChannelAccountSchema(database);
    return callback(database);
  } finally {
    database.close();
  }
}

function buildChannelAccountFromRow(
  row: Record<string, unknown>,
): StoredChannelAccount | null {
  const id = String(row.id || "").trim();
  if (!id) return null;
  const botTokenEncrypted =
    typeof row.bot_token_encrypted === "string" ? row.bot_token_encrypted : "";
  const appIdEncrypted =
    typeof row.app_id_encrypted === "string" ? row.app_id_encrypted : "";
  const appSecretEncrypted =
    typeof row.app_secret_encrypted === "string" ? row.app_secret_encrypted : "";

  return {
    id,
    channel: normalizeChannelAccountChannel(String(row.channel || "")),
    name: String(row.name || "").trim() || id,
    identity: optionalTrimmedText(String(row.identity || "")),
    owner: optionalTrimmedText(String(row.owner || "")),
    creator: optionalTrimmedText(String(row.creator || "")),
    botToken: optionalTrimmedText(
      botTokenEncrypted ? decryptTextSync(botTokenEncrypted) : undefined,
    ),
    appId: optionalTrimmedText(
      appIdEncrypted ? decryptTextSync(appIdEncrypted) : undefined,
    ),
    appSecret: optionalTrimmedText(
      appSecretEncrypted ? decryptTextSync(appSecretEncrypted) : undefined,
    ),
    domain: optionalTrimmedText(String(row.domain || "")),
    sandbox: Number(row.sandbox || 0) === 1,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

/**
 * 同步列出全部 channel account。
 */
export function listStoredChannelAccountsSync(
  channelInput?: string,
): StoredChannelAccount[] {
  return withChannelAccountDb((database) => {
    const maybeChannel = optionalTrimmedText(channelInput);
    const rows = maybeChannel
      ? database.prepare(
          `
          SELECT
            id, channel, name, identity, owner, creator,
            bot_token_encrypted, app_id_encrypted, app_secret_encrypted,
            domain, sandbox, created_at, updated_at
          FROM channel_accounts
          WHERE channel = ?
          ORDER BY name ASC, id ASC;
          `,
        ).all(maybeChannel)
      : database.prepare(
          `
          SELECT
            id, channel, name, identity, owner, creator,
            bot_token_encrypted, app_id_encrypted, app_secret_encrypted,
            domain, sandbox, created_at, updated_at
          FROM channel_accounts
          ORDER BY channel ASC, name ASC, id ASC;
          `,
        ).all();

    const out: StoredChannelAccount[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const item = buildChannelAccountFromRow(row);
      if (item) out.push(item);
    }
    return out;
  });
}

/**
 * 同步按 ID 读取单个 channel account。
 */
export function getStoredChannelAccountSync(
  accountIdInput: string,
): StoredChannelAccount | null {
  const accountId = normalizeNonEmptyText(accountIdInput, "channel account id");
  return withChannelAccountDb((database) => {
    const row = database.prepare(
      `
      SELECT
        id, channel, name, identity, owner, creator,
        bot_token_encrypted, app_id_encrypted, app_secret_encrypted,
        domain, sandbox, created_at, updated_at
      FROM channel_accounts
      WHERE id = ?
      LIMIT 1;
      `,
    ).get(accountId) as Record<string, unknown> | undefined;
    return row ? buildChannelAccountFromRow(row) : null;
  });
}

/**
 * 新增或更新 channel account。
 *
 * 关键点（中文）
 * - 这里保留和现有平台库一致的落盘结构，避免默认实现切换后出现数据断层。
 * - 未显式传入的敏感字段会保留旧值，便于 CLI 局部更新。
 */
export async function upsertStoredChannelAccount(
  input: UpsertChannelAccountInput,
): Promise<void> {
  const id = normalizeNonEmptyText(input.id, "channel account id");
  const channel = normalizeChannelAccountChannel(input.channel);
  const name = normalizeNonEmptyText(input.name, "channel account name");
  const existing = getStoredChannelAccountSync(id);
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

  const botTokenEncrypted = nextBotToken ? encryptTextSync(nextBotToken) : null;
  const appIdEncrypted = nextAppId ? encryptTextSync(nextAppId) : null;
  const appSecretEncrypted = nextAppSecret ? encryptTextSync(nextAppSecret) : null;

  withChannelAccountDb((database) => {
    database.prepare(
      `
      INSERT INTO channel_accounts (
        id, channel, name, identity, owner, creator,
        bot_token_encrypted, app_id_encrypted, app_secret_encrypted,
        domain, sandbox, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      createdAt,
      updatedAt,
    );
  });
}

/**
 * 删除单个 channel account。
 */
export async function removeStoredChannelAccount(
  accountIdInput: string,
): Promise<void> {
  const accountId = normalizeNonEmptyText(accountIdInput, "channel account id");
  withChannelAccountDb((database) => {
    database.prepare("DELETE FROM channel_accounts WHERE id = ?;").run(accountId);
  });
}
