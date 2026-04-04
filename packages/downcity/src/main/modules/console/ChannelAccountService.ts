/**
 * Console Channel Account 服务。
 *
 * 关键点（中文）
 * - 统一封装 channel account 的 CRUD。
 * - 敏感字段仅在写入时接收明文；读取时只返回脱敏与布尔状态。
 */

import { ConsoleStore } from "@/shared/utils/store/index.js";
import type { StoredChannelAccountChannel } from "@/shared/types/Store.js";
import { resolveChatChannelBotInfo } from "@services/chat/channels/BotInfoProvider.js";
import crypto from "node:crypto";

const SUPPORTED_CHANNELS: readonly StoredChannelAccountChannel[] = [
  "telegram",
  "feishu",
  "qq",
];

function maskSecret(value: string | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

function assertChannel(input: string): StoredChannelAccountChannel {
  const channel = String(input || "").trim().toLowerCase() as StoredChannelAccountChannel;
  if (!SUPPORTED_CHANNELS.includes(channel)) {
    throw new Error(
      `Unsupported channel: ${input}. Supported: ${SUPPORTED_CHANNELS.join(", ")}`,
    );
  }
  return channel;
}

function normalizeOptionalText(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text || undefined;
}

function normalizeChannelAccountIdToken(value: string): string {
  const token = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return token || "bot";
}

function pickFirstNonEmpty(inputs: unknown[]): string {
  for (const input of inputs) {
    const text = String(input || "").trim();
    if (text) return text;
  }
  return "";
}

type ChannelAccountProbeResult = {
  channel: StoredChannelAccountChannel;
  accountId: string;
  name: string;
  identity?: string;
  owner?: string;
  creator?: string;
  botUserId?: string;
  message: string;
};

/**
 * ChannelAccountService。
 */
export class ChannelAccountService {
  /**
   * 生成唯一 channel account id。
   *
   * 关键点（中文）
   * - 账号 id 统一由系统生成，避免用户手填导致冲突/命名不一致。
   * - 若碰撞会自动追加随机后缀重试。
   */
  private async generateUniqueAccountId(params: {
    channel: StoredChannelAccountChannel;
    seed?: string;
  }): Promise<string> {
    const seed = normalizeChannelAccountIdToken(params.seed || "");
    const prefix = `${params.channel}-${seed}`.slice(0, 36);
    const store = new ConsoleStore();
    try {
      for (let index = 0; index < 8; index += 1) {
        const suffix = crypto.randomBytes(3).toString("hex");
        const candidate = `${prefix}-${suffix}`.slice(0, 64);
        const existing = await store.getChannelAccount(candidate);
        if (!existing) return candidate;
      }
      return `${params.channel}-${Date.now().toString(36)}`;
    } finally {
      store.close();
    }
  }

  /**
   * 探测 bot 凭据并返回自动填充信息。
   */
  async probe(input: {
    channel: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
  }): Promise<ChannelAccountProbeResult> {
    const channel = assertChannel(input.channel);
    const botInfo = await resolveChatChannelBotInfo({
      channel,
      credentials: {
        botToken: normalizeOptionalText(input.botToken),
        appId: normalizeOptionalText(input.appId),
        appSecret: normalizeOptionalText(input.appSecret),
        domain: normalizeOptionalText(input.domain),
        sandbox: input.sandbox === true,
      },
    });
    const accountId = await this.generateUniqueAccountId({
      channel,
      seed: pickFirstNonEmpty([
        botInfo.idSeed,
        botInfo.botUserId,
        botInfo.identity,
        botInfo.name,
        "bot",
      ]),
    });

    return {
      channel,
      accountId,
      name: botInfo.name,
      identity: botInfo.identity,
      owner: botInfo.owner,
      creator: botInfo.creator,
      botUserId: botInfo.botUserId,
      message: botInfo.message,
    };
  }

  /**
   * 列出账户池（脱敏）。
   */
  async list(): Promise<{
    items: Array<{
      id: string;
      channel: StoredChannelAccountChannel;
      name: string;
      identity?: string;
      owner?: string;
      creator?: string;
      domain?: string;
      sandbox: boolean;
      hasBotToken: boolean;
      hasAppId: boolean;
      hasAppSecret: boolean;
      botTokenMasked?: string;
      appIdMasked?: string;
      appSecretMasked?: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const store = new ConsoleStore();
    try {
      const rows = await store.listChannelAccounts();
      return {
        items: rows.map((item) => ({
          id: item.id,
          channel: item.channel,
          name: item.name,
          identity: item.identity,
          owner: item.owner,
          creator: item.creator,
          domain: item.domain,
          sandbox: item.sandbox === true,
          hasBotToken: !!String(item.botToken || "").trim(),
          hasAppId: !!String(item.appId || "").trim(),
          hasAppSecret: !!String(item.appSecret || "").trim(),
          botTokenMasked: maskSecret(item.botToken),
          appIdMasked: maskSecret(item.appId),
          appSecretMasked: maskSecret(item.appSecret),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      };
    } finally {
      store.close();
    }
  }

  /**
   * 新增或更新账户。
   */
  async upsert(input: {
    id: string;
    channel: string;
    name: string;
    identity?: string;
    owner?: string;
    creator?: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
    clearBotToken?: boolean;
    clearAppId?: boolean;
    clearAppSecret?: boolean;
  }): Promise<{ id: string }> {
    const id = String(input.id || "").trim();
    if (!id) throw new Error("channel account id cannot be empty");
    const name = String(input.name || "").trim();
    if (!name) throw new Error("channel account name cannot be empty");

    const channel = assertChannel(input.channel);

    if (input.botToken !== undefined && input.clearBotToken === true) {
      throw new Error("botToken and clearBotToken cannot be used together");
    }
    if (input.appId !== undefined && input.clearAppId === true) {
      throw new Error("appId and clearAppId cannot be used together");
    }
    if (input.appSecret !== undefined && input.clearAppSecret === true) {
      throw new Error("appSecret and clearAppSecret cannot be used together");
    }

    const store = new ConsoleStore();
    try {
      const current = await store.getChannelAccount(id);
      const nextBotToken = input.clearBotToken
        ? undefined
        : input.botToken !== undefined
          ? normalizeOptionalText(input.botToken)
          : current?.botToken;
      const nextAppId = input.clearAppId
        ? undefined
        : input.appId !== undefined
          ? normalizeOptionalText(input.appId)
          : current?.appId;
      const nextAppSecret = input.clearAppSecret
        ? undefined
        : input.appSecret !== undefined
          ? normalizeOptionalText(input.appSecret)
          : current?.appSecret;
      const nextIdentity = Object.prototype.hasOwnProperty.call(input, "identity")
        ? normalizeOptionalText(input.identity)
        : current?.identity;
      const nextOwner = Object.prototype.hasOwnProperty.call(input, "owner")
        ? normalizeOptionalText(input.owner)
        : current?.owner;
      const nextCreator = Object.prototype.hasOwnProperty.call(input, "creator")
        ? normalizeOptionalText(input.creator)
        : current?.creator;

      await store.upsertChannelAccount({
        id,
        channel,
        name,
        identity: nextIdentity,
        owner: nextOwner,
        creator: nextCreator,
        botToken: nextBotToken,
        appId: nextAppId,
        appSecret: nextAppSecret,
        domain: normalizeOptionalText(input.domain),
        sandbox: input.sandbox === true,
      });
      return { id };
    } finally {
      store.close();
    }
  }

  /**
   * 删除账户。
   */
  remove(idInput: string): void {
    const id = String(idInput || "").trim();
    if (!id) throw new Error("channel account id cannot be empty");
    const store = new ConsoleStore();
    try {
      store.removeChannelAccount(id);
    } finally {
      store.close();
    }
  }
}
