/**
 * ConsoleStore 渠道账号仓储。
 *
 * 关键点（中文）
 * - 统一管理 `channel_accounts` 表。
 * - 负责敏感字段解密/加密与 channel account 的语义化组装。
 */

import type {
  StoredChannelAccount,
  UpsertChannelAccountInput,
} from "@/types/Store.js";
import { decryptText, decryptTextSync, encryptText } from "./crypto.js";
import type { ConsoleStoreContext } from "./StoreShared.js";
import {
  normalizeChannelAccountChannel,
  normalizeNonEmptyText,
  nowIso,
  optionalTrimmedText,
} from "./StoreShared.js";

/**
 * 同步列出 channel accounts。
 */
export function listChannelAccountsSync(
  context: ConsoleStoreContext,
  channelInput?: string,
): StoredChannelAccount[] {
  const maybeChannel = optionalTrimmedText(channelInput);
  const rows = maybeChannel
    ? context.sqlite.prepare(
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
    : context.sqlite.prepare(
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
    const entry = buildChannelAccountFromRowSync(row);
    if (entry) out.push(entry);
  }
  return out;
}

/**
 * 同步按 ID 获取 channel account。
 */
export function getChannelAccountSync(
  context: ConsoleStoreContext,
  accountIdInput: string,
): StoredChannelAccount | null {
  const accountId = normalizeNonEmptyText(accountIdInput, "channel account id");
  const rows = listChannelAccountsSync(context);
  return rows.find((item) => item.id === accountId) || null;
}

/**
 * 异步列出 channel accounts。
 */
export async function listChannelAccounts(
  context: ConsoleStoreContext,
  channelInput?: string,
): Promise<StoredChannelAccount[]> {
  const maybeChannel = optionalTrimmedText(channelInput);
  const rows = maybeChannel
    ? context.sqlite.prepare(
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
    : context.sqlite.prepare(
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
    const entry = await buildChannelAccountFromRow(row);
    if (entry) out.push(entry);
  }
  return out;
}

/**
 * 异步按 ID 获取 channel account。
 */
export async function getChannelAccount(
  context: ConsoleStoreContext,
  accountIdInput: string,
): Promise<StoredChannelAccount | null> {
  const accountId = normalizeNonEmptyText(accountIdInput, "channel account id");
  const rows = await listChannelAccounts(context);
  return rows.find((item) => item.id === accountId) || null;
}

/**
 * 新增或更新 channel account。
 */
export async function upsertChannelAccount(
  context: ConsoleStoreContext,
  input: UpsertChannelAccountInput,
): Promise<void> {
  const id = normalizeNonEmptyText(input.id, "channel account id");
  const channel = normalizeChannelAccountChannel(input.channel);
  const name = normalizeNonEmptyText(input.name, "channel account name");
  const existing = await getChannelAccount(context, id);
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

  context.sqlite.prepare(
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
}

/**
 * 删除 channel account。
 */
export function removeChannelAccount(
  context: ConsoleStoreContext,
  accountIdInput: string,
): void {
  const accountId = normalizeNonEmptyText(accountIdInput, "channel account id");
  context.sqlite.prepare("DELETE FROM channel_accounts WHERE id = ?;").run(accountId);
}

/**
 * 同步构造 channel account。
 */
function buildChannelAccountFromRowSync(
  row: Record<string, unknown>,
): StoredChannelAccount | null {
  const id = String(row.id || "").trim();
  if (!id) return null;
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
  return {
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
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

/**
 * 异步构造 channel account。
 */
async function buildChannelAccountFromRow(
  row: Record<string, unknown>,
): Promise<StoredChannelAccount | null> {
  const id = String(row.id || "").trim();
  if (!id) return null;
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
  return {
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
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}
