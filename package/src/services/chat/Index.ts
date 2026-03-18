/**
 * Chat service。
 *
 * 关键点（中文）
 * - 使用统一 actions 模型声明 CLI/API/执行逻辑
 * - API 默认路由为 `/service/chat/<action>`
 * - 业务逻辑下沉到 `services/chat/Action.ts`
 */

import path from "node:path";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  resolveChatContextSnapshot,
  resolveChatKey,
  sendChatActionByChatKey,
  sendChatTextByChatKey,
} from "./Action.js";
import { readChatHistory } from "./runtime/ChatHistoryStore.js";
import { resolveChatMethod, type ChatMethod } from "./runtime/ChatMethod.js";
import { createTelegramBot } from "./channels/telegram/Bot.js";
import { createFeishuBot } from "./channels/feishu/Feishu.js";
import { createQQBot } from "./channels/qq/QQ.js";
import type {
  Service,
  ServiceActionCommandInput,
} from "@agent/service/ServiceManager.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type { ChatHistoryEventV1 } from "./types/ChatHistory.js";
import type { ChatHistoryRequest, ChatReactRequest } from "./types/ChatCommand.js";
import type { TelegramBot } from "./channels/telegram/Bot.js";
import type { FeishuBot } from "./channels/feishu/Feishu.js";
import type { QQBot } from "./channels/qq/QQ.js";
import type {
  ChatChannelName,
  ChatChannelRuntimeSnapshot,
  ChatChannelTestResult,
} from "./types/ChannelStatus.js";

type ChatChannelState = {
  telegram: TelegramBot | null;
  feishu: FeishuBot | null;
  qq: QQBot | null;
};

type ChatSendActionPayload = {
  text: string;
  chatKey?: string;
  delayMs?: number;
  sendAtMs?: number;
  replyToMessage?: boolean;
};

type ChatContextActionPayload = {
  chatKey?: string;
  contextId?: string;
};

type ChatHistoryActionPayload = ChatHistoryRequest;
type ChatReactActionPayload = ChatReactRequest;
type ChatStatusActionPayload = {
  channel?: ChatChannelName;
};
type ChatTestActionPayload = {
  channel?: ChatChannelName;
};
type ChatReconnectActionPayload = {
  channel?: ChatChannelName;
};
type ChatOpenActionPayload = {
  channel?: ChatChannelName;
};
type ChatCloseActionPayload = {
  channel?: ChatChannelName;
};
type ChatConfigureActionPayload = {
  channel: ChatChannelName;
  config: Record<string, JsonValue>;
  restart?: boolean;
};

const CHAT_CHANNEL_NAMES: ChatChannelName[] = ["telegram", "feishu", "qq"];

const CHAT_PROMPT_FILE_URL = new URL("./PROMPT.txt", import.meta.url);
const CHAT_DIRECT_PROMPT_FILE_URL = new URL("./PROMPT.direct.txt", import.meta.url);
const TELEGRAM_PROMPT_FILE_URL = new URL(
  "./channels/telegram/PROMPT.txt",
  import.meta.url,
);
const TELEGRAM_DIRECT_PROMPT_FILE_URL = new URL(
  "./channels/telegram/PROMPT.direct.txt",
  import.meta.url,
);
const FEISHU_PROMPT_FILE_URL = new URL(
  "./channels/feishu/PROMPT.txt",
  import.meta.url,
);
const FEISHU_DIRECT_PROMPT_FILE_URL = new URL(
  "./channels/feishu/PROMPT.direct.txt",
  import.meta.url,
);
const QQ_PROMPT_FILE_URL = new URL("./channels/qq/PROMPT.txt", import.meta.url);
const QQ_DIRECT_PROMPT_FILE_URL = new URL(
  "./channels/qq/PROMPT.direct.txt",
  import.meta.url,
);

/**
 * 加载 chat service 使用说明提示词。
 *
 * 关键点（中文）
 * - 启动阶段即加载，缺失时直接抛错，避免静默失效。
 */
function loadChatServicePrompt(fileUrl: URL): string {
  try {
    return readFileSync(fileUrl, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load chat service prompt from ${fileUrl.pathname}: ${reason}`,
    );
  }
}

const CHAT_SERVICE_PROMPTS: Record<ChatMethod, string> = {
  cmd: loadChatServicePrompt(CHAT_PROMPT_FILE_URL),
  direct: loadChatServicePrompt(CHAT_DIRECT_PROMPT_FILE_URL),
};

/**
 * 加载单个 channel 提示词。
 *
 * 关键点（中文）
 * - channel 提示词属于强依赖资产，缺失时直接抛错，避免运行时悄悄丢失规则。
 */
function loadChatChannelPrompt(fileUrl: URL, channelName: string): string {
  try {
    return readFileSync(fileUrl, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load ${channelName} chat channel prompt from ${fileUrl.pathname}: ${reason}`,
    );
  }
}

const CHAT_CHANNEL_PROMPTS: Record<
  "telegram" | "feishu" | "qq",
  Record<ChatMethod, string>
> = {
  telegram: {
    cmd: loadChatChannelPrompt(TELEGRAM_PROMPT_FILE_URL, "telegram"),
    direct: loadChatChannelPrompt(
      TELEGRAM_DIRECT_PROMPT_FILE_URL,
      "telegram-direct",
    ),
  },
  feishu: {
    cmd: loadChatChannelPrompt(FEISHU_PROMPT_FILE_URL, "feishu"),
    direct: loadChatChannelPrompt(FEISHU_DIRECT_PROMPT_FILE_URL, "feishu-direct"),
  },
  qq: {
    cmd: loadChatChannelPrompt(QQ_PROMPT_FILE_URL, "qq"),
    direct: loadChatChannelPrompt(QQ_DIRECT_PROMPT_FILE_URL, "qq-direct"),
  },
};

/**
 * 构建当前启用 channel 的提示词片段。
 *
 * 关键点（中文）
 * - 仅注入已启用 channel，避免给模型引入未接入平台的噪音规则。
 */
function buildEnabledChannelPrompts(
  context: ServiceRuntime,
  method: ChatMethod,
): string[] {
  const prompts: string[] = [];
  const channels = context.config.services?.chat?.channels || {};
  if (channels.telegram?.enabled) {
    prompts.push(CHAT_CHANNEL_PROMPTS.telegram[method]);
  }
  if (channels.feishu?.enabled) {
    prompts.push(CHAT_CHANNEL_PROMPTS.feishu[method]);
  }
  if (channels.qq?.enabled) {
    prompts.push(CHAT_CHANNEL_PROMPTS.qq[method]);
  }
  return prompts;
}

let channelState: ChatChannelState = {
  telegram: null,
  feishu: null,
  qq: null,
};

function resetChannelState(): void {
  channelState = {
    telegram: null,
    feishu: null,
    qq: null,
  };
}

// 占位符判定（中文）：init 生成的模板值 `${...}` 不应被当作真实密钥。
function isPlaceholder(value?: string): boolean {
  return value === "${}";
}

function readAgentEnv(context: ServiceRuntime, key: string): string {
  return String(context.env?.[key] || "").trim();
}

function resolveChatChannelNameOrThrow(value: string): ChatChannelName {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "telegram" ||
    normalized === "feishu" ||
    normalized === "qq"
  ) {
    return normalized;
  }
  throw new Error(`Invalid channel: ${value}. Use telegram|feishu|qq.`);
}

function resolveTelegramToken(context: ServiceRuntime): string {
  const token = context.config.services?.chat?.channels?.telegram?.botToken;
  if (token && !isPlaceholder(token)) return token;
  return readAgentEnv(context, "TELEGRAM_BOT_TOKEN");
}

function resolveFeishuCredentials(context: ServiceRuntime): {
  appId: string;
  appSecret: string;
} {
  const channel = context.config.services?.chat?.channels?.feishu;
  return {
    appId:
      (channel?.appId && !isPlaceholder(channel.appId) ? channel.appId : "") ||
      readAgentEnv(context, "FEISHU_APP_ID"),
    appSecret:
      (channel?.appSecret && !isPlaceholder(channel.appSecret)
        ? channel.appSecret
        : "") || readAgentEnv(context, "FEISHU_APP_SECRET"),
  };
}

function resolveQQCredentials(context: ServiceRuntime): {
  appId: string;
  appSecret: string;
} {
  const channel = context.config.services?.chat?.channels?.qq;
  return {
    appId:
      (channel?.appId && !isPlaceholder(channel.appId) ? channel.appId : "") ||
      readAgentEnv(context, "QQ_APP_ID"),
    appSecret:
      (channel?.appSecret && !isPlaceholder(channel.appSecret)
        ? channel.appSecret
        : "") || readAgentEnv(context, "QQ_APP_SECRET"),
  };
}

async function startTelegramChannel(context: ServiceRuntime): Promise<void> {
  if (!context.config.services?.chat?.channels?.telegram?.enabled) return;
  context.logger.info("Telegram channel enabled");
  channelState.telegram = createTelegramBot(
    {
      ...(context.config.services?.chat?.channels?.telegram || {}),
      enabled: true,
      botToken: resolveTelegramToken(context),
    },
    context,
  );
  if (channelState.telegram) {
    await channelState.telegram.start();
  }
}

async function startFeishuChannel(context: ServiceRuntime): Promise<void> {
  if (!context.config.services?.chat?.channels?.feishu?.enabled) return;
  context.logger.info("Feishu channel enabled");
  const feishuChannel = context.config.services?.chat?.channels?.feishu as
    | { domain?: string }
    | undefined;
  const credentials = resolveFeishuCredentials(context);
  channelState.feishu = await createFeishuBot(
    {
      enabled: true,
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      domain: feishuChannel?.domain || "https://open.feishu.cn",
    },
    context,
  );
  if (channelState.feishu) {
    await channelState.feishu.start();
  }
}

async function startQQChannel(context: ServiceRuntime): Promise<void> {
  if (!context.config.services?.chat?.channels?.qq?.enabled) return;
  context.logger.info("QQ channel enabled");
  const qqChannel = context.config.services?.chat?.channels?.qq;
  const credentials = resolveQQCredentials(context);
  channelState.qq = await createQQBot(
    {
      enabled: true,
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      sandbox:
        typeof qqChannel?.sandbox === "boolean"
          ? qqChannel.sandbox
          : readAgentEnv(context, "QQ_SANDBOX").toLowerCase() === "true",
    },
    context,
  );
  if (channelState.qq) {
    await channelState.qq.start();
  }
}

async function startSingleChatChannel(
  context: ServiceRuntime,
  channel: ChatChannelName,
): Promise<void> {
  if (channel === "telegram") {
    await startTelegramChannel(context);
    return;
  }
  if (channel === "feishu") {
    await startFeishuChannel(context);
    return;
  }
  await startQQChannel(context);
}

async function stopSingleChatChannel(channel: ChatChannelName): Promise<void> {
  if (channel === "telegram" && channelState.telegram) {
    const bot = channelState.telegram;
    channelState.telegram = null;
    await bot.stop();
    return;
  }
  if (channel === "feishu" && channelState.feishu) {
    const bot = channelState.feishu;
    channelState.feishu = null;
    await bot.stop();
    return;
  }
  if (channel === "qq" && channelState.qq) {
    const bot = channelState.qq;
    channelState.qq = null;
    await bot.stop();
  }
}

async function startChatChannels(context: ServiceRuntime): Promise<void> {
  if (channelState.telegram || channelState.feishu || channelState.qq) {
    await stopChatChannels();
  }
  for (const channel of CHAT_CHANNEL_NAMES) {
    await startSingleChatChannel(context, channel);
  }
}

async function stopChatChannels(): Promise<void> {
  const current = channelState;
  resetChannelState();

  if (current.telegram) {
    await current.telegram.stop();
  }
  if (current.feishu) {
    await current.feishu.stop();
  }
  if (current.qq) {
    await current.qq.stop();
  }
}

function resolveTargetChannels(
  channel?: ChatChannelName,
): ChatChannelName[] {
  return channel ? [channel] : [...CHAT_CHANNEL_NAMES];
}

function getChatChannelStatus(
  context: ServiceRuntime,
  channel: ChatChannelName,
): ChatChannelRuntimeSnapshot {
  const channels = context.config.services?.chat?.channels || {};
  const enabled = channels[channel]?.enabled === true;
  const configured =
    channel === "telegram"
      ? !!resolveTelegramToken(context)
      : channel === "feishu"
        ? (() => {
            const c = resolveFeishuCredentials(context);
            return !!c.appId && !!c.appSecret;
          })()
        : (() => {
            const c = resolveQQCredentials(context);
            return !!c.appId && !!c.appSecret;
          })();

  const runtime =
    channel === "telegram"
      ? channelState.telegram?.getRuntimeStatus()
      : channel === "feishu"
        ? channelState.feishu?.getRuntimeStatus()
        : channelState.qq?.getRuntimeStatus();
  const linkState = !enabled
    ? "disconnected"
    : !configured
      ? "disconnected"
      : runtime?.linkState || "unknown";
  const statusText = !enabled
    ? "disabled"
    : !configured
      ? "config_missing"
      : runtime?.statusText || "not_started";

  return {
    channel,
    enabled,
    configured,
    running: runtime?.running === true,
    linkState,
    statusText,
    detail: {
      ...(runtime?.detail || {}),
      config: buildChatChannelConfigSummary(context, channel),
    },
  };
}

/**
 * 生成可安全暴露给 UI 的渠道配置摘要。
 *
 * 关键点（中文）
 * - 不返回明文密钥，只返回布尔“是否已配置”。
 * - 字段命名尽量贴近 `ship.json`，便于前端直接映射编辑。
 */
function buildChatChannelConfigSummary(
  context: ServiceRuntime,
  channel: ChatChannelName,
): Record<string, string | number | boolean | null> {
  const channels = context.config.services?.chat?.channels;
  if (channel === "telegram") {
    const cfg = channels?.telegram;
    return {
      enabled: cfg?.enabled === true,
      botTokenConfigured: !!resolveTelegramToken(context),
      auth_id:
        typeof cfg?.auth_id === "string" && cfg.auth_id.trim()
          ? cfg.auth_id.trim()
          : null,
    };
  }
  if (channel === "feishu") {
    const cfg = channels?.feishu;
    const credentials = resolveFeishuCredentials(context);
    const appIdFromConfig =
      typeof cfg?.appId === "string" && cfg.appId.trim() && !isPlaceholder(cfg.appId)
        ? cfg.appId.trim()
        : "";
    const appIdSource = appIdFromConfig
      ? "ship"
      : credentials.appId
        ? "env"
        : "none";
    return {
      enabled: cfg?.enabled === true,
      appId: credentials.appId || null,
      appIdFromConfig: appIdFromConfig || null,
      appIdSource,
      appSecretConfigured: !!credentials.appSecret,
      domain:
        typeof cfg?.domain === "string" && cfg.domain.trim()
          ? cfg.domain.trim()
          : "https://open.feishu.cn",
      auth_id:
        typeof cfg?.auth_id === "string" && cfg.auth_id.trim()
          ? cfg.auth_id.trim()
          : null,
    };
  }
  const cfg = channels?.qq;
  const credentials = resolveQQCredentials(context);
  const appIdFromConfig =
    typeof cfg?.appId === "string" && cfg.appId.trim() && !isPlaceholder(cfg.appId)
      ? cfg.appId.trim()
      : "";
  const appIdSource = appIdFromConfig
    ? "ship"
    : credentials.appId
      ? "env"
      : "none";
  return {
    enabled: cfg?.enabled === true,
    appId: credentials.appId || null,
    appIdFromConfig: appIdFromConfig || null,
    appIdSource,
    appSecretConfigured: !!credentials.appSecret,
    sandbox: cfg?.sandbox === true,
    auth_id:
      typeof cfg?.auth_id === "string" && cfg.auth_id.trim()
        ? cfg.auth_id.trim()
        : null,
  };
}

/**
 * 更新内存配置与 ship.json 中的 channel enabled 状态。
 *
 * 关键点（中文）
 * - 先更新 runtime `context.config`，保证当前进程立刻可见。
 * - 再落盘到项目 `ship.json`，保证重启后状态一致。
 */
async function setChatChannelEnabled(params: {
  context: ServiceRuntime;
  channel: ChatChannelName;
  enabled: boolean;
}): Promise<void> {
  const { context, channel, enabled } = params;

  const configServices = ((context.config.services ??= {}) as {
    chat?: {
      channels?: Record<string, Record<string, unknown>>;
    };
  });
  const chatConfig = (configServices.chat ??= {});
  const channelConfigs = (chatConfig.channels ??= {});
  const channelConfig = (channelConfigs[channel] ??= {});
  channelConfig.enabled = enabled;

  const shipPath = path.join(context.rootPath, "ship.json");
  let shipJson: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(shipPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      shipJson = parsed as Record<string, unknown>;
    }
  } catch {
    shipJson = {};
  }

  const shipServices = ((shipJson.services ??= {}) as Record<string, unknown>);
  const shipChat = ((shipServices.chat ??= {}) as Record<string, unknown>);
  const shipChannels = ((shipChat.channels ??= {}) as Record<string, unknown>);
  const shipChannel = ((shipChannels[channel] ??= {}) as Record<string, unknown>);
  shipChannel.enabled = enabled;

  await fs.writeFile(shipPath, `${JSON.stringify(shipJson, null, 2)}\n`, "utf-8");
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readOptionalStringPatch(value: JsonValue): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readOptionalBooleanPatch(value: JsonValue): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "1") return true;
    if (text === "false" || text === "0") return false;
  }
  return undefined;
}

/**
 * 解析 chat.configure patch。
 *
 * 关键点（中文）
 * - 只接受白名单字段，避免 UI 误写入未知键。
 * - 密钥类字段支持 `null` 清空，字符串会自动 trim。
 */
function normalizeChatChannelConfigPatch(params: {
  channel: ChatChannelName;
  config: Record<string, JsonValue>;
}): Record<string, string | number | boolean | null> {
  const channel = params.channel;
  const config = params.config;
  const patch: Record<string, string | number | boolean | null> = {};

  const enabled = readOptionalBooleanPatch(config.enabled);
  if (typeof enabled === "boolean") patch.enabled = enabled;

  if (channel === "telegram") {
    const botToken = readOptionalStringPatch(config.botToken);
    if (botToken !== undefined) patch.botToken = botToken;

    const authId = readOptionalStringPatch(config.auth_id);
    if (authId !== undefined) patch.auth_id = authId;
    return patch;
  }

  if (channel === "feishu") {
    const appId = readOptionalStringPatch(config.appId);
    if (appId !== undefined) patch.appId = appId;

    const appSecret = readOptionalStringPatch(config.appSecret);
    if (appSecret !== undefined) patch.appSecret = appSecret;

    const domain = readOptionalStringPatch(config.domain);
    if (domain !== undefined) patch.domain = domain;

    const authId = readOptionalStringPatch(config.auth_id);
    if (authId !== undefined) patch.auth_id = authId;
    return patch;
  }

  const appId = readOptionalStringPatch(config.appId);
  if (appId !== undefined) patch.appId = appId;

  const appSecret = readOptionalStringPatch(config.appSecret);
  if (appSecret !== undefined) patch.appSecret = appSecret;

  const sandbox = readOptionalBooleanPatch(config.sandbox);
  if (typeof sandbox === "boolean") patch.sandbox = sandbox;

  const authId = readOptionalStringPatch(config.auth_id);
  if (authId !== undefined) patch.auth_id = authId;
  return patch;
}

function applyChannelPatch(
  target: Record<string, unknown>,
  patch: Record<string, string | number | boolean | null>,
): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete target[key];
      continue;
    }
    target[key] = value;
  }
}

/**
 * 更新单个 channel 配置（内存 + ship.json）。
 *
 * 关键点（中文）
 * - 与 `setChatChannelEnabled` 一样保持“先内存后落盘”。
 * - patch 可同时包含启停开关和凭据参数。
 */
async function setChatChannelConfig(params: {
  context: ServiceRuntime;
  channel: ChatChannelName;
  patch: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const { context, channel, patch } = params;
  if (Object.keys(patch).length === 0) return;

  const configServices = ((context.config.services ??= {}) as {
    chat?: {
      channels?: Record<string, Record<string, unknown>>;
    };
  });
  const chatConfig = (configServices.chat ??= {});
  const channelConfigs = (chatConfig.channels ??= {});
  const channelConfig = (channelConfigs[channel] ??= {});
  applyChannelPatch(channelConfig, patch);

  const shipPath = path.join(context.rootPath, "ship.json");
  let shipJson: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(shipPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      shipJson = parsed as Record<string, unknown>;
    }
  } catch {
    shipJson = {};
  }

  const shipServices = ((shipJson.services ??= {}) as Record<string, unknown>);
  const shipChat = ((shipServices.chat ??= {}) as Record<string, unknown>);
  const shipChannels = ((shipChat.channels ??= {}) as Record<string, unknown>);
  const shipChannel = ((shipChannels[channel] ??= {}) as Record<string, unknown>);
  applyChannelPatch(shipChannel, patch);

  await fs.writeFile(shipPath, `${JSON.stringify(shipJson, null, 2)}\n`, "utf-8");
}

async function executeChatStatusAction(params: {
  context: ServiceRuntime;
  payload: ChatStatusActionPayload;
}) {
  const channels = resolveTargetChannels(params.payload.channel);
  const items = channels.map((channel) =>
    getChatChannelStatus(params.context, channel),
  );
  return {
    success: true,
    data: {
      channels: items,
    },
  };
}

async function executeChatTestAction(params: {
  context: ServiceRuntime;
  payload: ChatTestActionPayload;
}) {
  const channels = resolveTargetChannels(params.payload.channel);
  const results: ChatChannelTestResult[] = [];
  for (const channel of channels) {
    const snapshot = getChatChannelStatus(params.context, channel);
    if (!snapshot.enabled) {
      results.push({
        channel,
        success: false,
        testedAtMs: Date.now(),
        message: "Channel is disabled",
      });
      continue;
    }
    if (!snapshot.configured) {
      results.push({
        channel,
        success: false,
        testedAtMs: Date.now(),
        message: "Channel credentials are missing",
      });
      continue;
    }

    const bot =
      channel === "telegram"
        ? channelState.telegram
        : channel === "feishu"
          ? channelState.feishu
          : channelState.qq;
    if (!bot) {
      results.push({
        channel,
        success: false,
        testedAtMs: Date.now(),
        message: "Channel is not running. Use reconnect first.",
      });
      continue;
    }
    results.push(await bot.testConnection());
  }

  return {
    success: true,
    data: {
      results,
      total: results.length,
      failed: results.filter((item) => !item.success).length,
    },
  };
}

async function executeChatReconnectAction(params: {
  context: ServiceRuntime;
  payload: ChatReconnectActionPayload;
}) {
  const targets = resolveTargetChannels(params.payload.channel);
  for (const channel of targets) {
    const snapshot = getChatChannelStatus(params.context, channel);
    if (!snapshot.enabled) {
      return {
        success: false,
        error: `Channel ${channel} is disabled`,
      };
    }
    if (!snapshot.configured) {
      return {
        success: false,
        error: `Channel ${channel} credentials are missing`,
      };
    }
  }

  for (const channel of targets) {
    await stopSingleChatChannel(channel);
  }
  for (const channel of targets) {
    await startSingleChatChannel(params.context, channel);
  }

  const channels = targets.map((channel) =>
    getChatChannelStatus(params.context, channel),
  );
  return {
    success: true,
    data: {
      channels,
    },
  };
}

async function executeChatOpenAction(params: {
  context: ServiceRuntime;
  payload: ChatOpenActionPayload;
}) {
  const targets = resolveTargetChannels(params.payload.channel);
  for (const channel of targets) {
    await setChatChannelEnabled({
      context: params.context,
      channel,
      enabled: true,
    });
  }

  for (const channel of targets) {
    const snapshot = getChatChannelStatus(params.context, channel);
    if (!snapshot.configured) continue;
    if (snapshot.running) continue;
    await startSingleChatChannel(params.context, channel);
  }

  const channels = targets.map((channel) =>
    getChatChannelStatus(params.context, channel),
  );
  return {
    success: true,
    data: {
      channels,
    },
  };
}

async function executeChatCloseAction(params: {
  context: ServiceRuntime;
  payload: ChatCloseActionPayload;
}) {
  const targets = resolveTargetChannels(params.payload.channel);
  for (const channel of targets) {
    await stopSingleChatChannel(channel);
    await setChatChannelEnabled({
      context: params.context,
      channel,
      enabled: false,
    });
  }

  const channels = targets.map((channel) =>
    getChatChannelStatus(params.context, channel),
  );
  return {
    success: true,
    data: {
      channels,
    },
  };
}

async function executeChatConfigureAction(params: {
  context: ServiceRuntime;
  payload: ChatConfigureActionPayload;
}) {
  const channel = params.payload.channel;
  const patch = normalizeChatChannelConfigPatch({
    channel,
    config: params.payload.config || {},
  });

  if (Object.keys(patch).length === 0) {
    return {
      success: false,
      error: "No valid config fields provided",
    };
  }

  await setChatChannelConfig({
    context: params.context,
    channel,
    patch,
  });

  // 关键点（中文）：默认重载一次目标渠道，让新配置立刻生效。
  const restart = params.payload.restart !== false;
  if (restart) {
    await stopSingleChatChannel(channel);
    const snapshot = getChatChannelStatus(params.context, channel);
    if (snapshot.enabled && snapshot.configured) {
      await startSingleChatChannel(params.context, channel);
    }
  }

  return {
    success: true,
    data: {
      channel,
      restartApplied: restart,
      appliedKeys: Object.keys(patch),
      channels: [getChatChannelStatus(params.context, channel)],
    },
  };
}

function getStringOpt(opts: Record<string, JsonValue>, key: string): string {
  return typeof opts[key] === "string" ? String(opts[key]).trim() : "";
}

function getBooleanOpt(opts: Record<string, JsonValue>, key: string): boolean {
  return opts[key] === true;
}

function mapChatChannelCommandInput(
  input: ServiceActionCommandInput,
): { channel?: ChatChannelName } {
  const channelRaw = getStringOpt(input.opts, "channel");
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

function mapChatChannelApiInput(body: JsonValue): { channel?: ChatChannelName } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const channelRaw =
    typeof (body as JsonObject).channel === "string"
      ? String((body as JsonObject).channel).trim()
      : "";
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

function mapChatChannelApiQueryInput(query?: {
  channel?: string;
}): { channel?: ChatChannelName } {
  const channelRaw = String(query?.channel || "").trim();
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

function mapChatConfigureCommandInput(
  input: ServiceActionCommandInput,
): ChatConfigureActionPayload {
  const channelRaw = getStringOpt(input.opts, "channel");
  if (!channelRaw) {
    throw new Error("Missing --channel. Use telegram|feishu|qq.");
  }
  const channel = resolveChatChannelNameOrThrow(channelRaw);
  const rawConfigJson = getStringOpt(input.opts, "configJson");
  if (!rawConfigJson) {
    throw new Error("Missing --config-json.");
  }
  let parsed: JsonValue = {};
  try {
    parsed = JSON.parse(rawConfigJson) as JsonValue;
  } catch (error) {
    throw new Error(`Invalid --config-json: ${String(error)}`);
  }
  if (!isJsonObject(parsed)) {
    throw new Error("--config-json must be a JSON object");
  }
  return {
    channel,
    config: parsed as Record<string, JsonValue>,
    restart: getBooleanOpt(input.opts, "restart"),
  };
}

async function mapChatConfigureApiInput(c: {
  req: {
    json: () => Promise<JsonValue>;
  };
}): Promise<ChatConfigureActionPayload> {
  const body = await c.req.json().catch(() => ({} as JsonValue));
  if (!isJsonObject(body)) {
    throw new Error("Invalid JSON body");
  }
  const channelRaw =
    typeof body.channel === "string" ? String(body.channel).trim() : "";
  if (!channelRaw) {
    throw new Error("Missing channel");
  }
  const configRaw = body.config;
  if (!isJsonObject(configRaw)) {
    throw new Error("Missing config object");
  }
  const restart =
    typeof body.restart === "boolean" ? body.restart : undefined;
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
    config: configRaw as Record<string, JsonValue>,
    ...(typeof restart === "boolean" ? { restart } : {}),
  };
}

function parsePositiveIntOptionOrThrow(value: string, fieldName: string): number {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

function parseNonNegativeIntOptionOrThrow(value: string, fieldName: string): number {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

function looksLikeIsoDatetimeWithoutTimezone(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  const isoLike = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text);
  if (!isoLike) return false;
  return !/(?:Z|[+-]\d{2}:\d{2})$/i.test(text);
}

/**
 * 解析定时发送时间。
 *
 * 支持格式（中文）
 * - Unix 时间戳：秒或毫秒（纯数字）
 * - ISO 时间字符串：例如 `2026-03-05T20:30:00+08:00`
 */
function parseSendTimeOptionOrThrow(value: string, fieldName: string): number {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }

  if (/^\d+$/.test(text)) {
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid ${fieldName}: ${value}`);
    }
    // 关键点（中文）：10 位通常是秒级时间戳，统一转换为毫秒。
    return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
  }
  if (looksLikeIsoDatetimeWithoutTimezone(text)) {
    throw new Error(
      `Invalid ${fieldName}: ${value}. ISO datetime must include timezone offset (e.g. +08:00 or Z).`,
    );
  }

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${fieldName}: ${value}. Use Unix timestamp (seconds/ms) or ISO datetime.`,
    );
  }
  return parsed;
}

function parseOptionalTimestampOrThrow(
  value: string,
  fieldName: string,
): number | undefined {
  const text = String(value || "").trim();
  if (!text) return undefined;
  return parsePositiveIntOptionOrThrow(text, fieldName);
}

function readHistoryDirectionOrThrow(
  value: string,
): "all" | "inbound" | "outbound" | undefined {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return undefined;
  if (text === "all" || text === "inbound" || text === "outbound") {
    return text;
  }
  throw new Error(`Invalid direction: ${value}. Use all|inbound|outbound.`);
}

function mapChatHistoryCommandInput(
  input: ServiceActionCommandInput,
): ChatHistoryActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const contextId = getStringOpt(input.opts, "contextId");
  const direction = readHistoryDirectionOrThrow(
    getStringOpt(input.opts, "direction"),
  );
  const limitRaw = getStringOpt(input.opts, "limit");
  const beforeTs = parseOptionalTimestampOrThrow(
    getStringOpt(input.opts, "beforeTs"),
    "beforeTs",
  );
  const afterTs = parseOptionalTimestampOrThrow(
    getStringOpt(input.opts, "afterTs"),
    "afterTs",
  );
  const limit = limitRaw ? parsePositiveIntOptionOrThrow(limitRaw, "limit") : undefined;

  if (
    typeof beforeTs === "number" &&
    typeof afterTs === "number" &&
    afterTs >= beforeTs
  ) {
    throw new Error("Invalid range: afterTs must be less than beforeTs.");
  }

  return {
    ...(chatKey ? { chatKey } : {}),
    ...(contextId ? { contextId } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(direction ? { direction } : {}),
    ...(typeof beforeTs === "number" ? { beforeTs } : {}),
    ...(typeof afterTs === "number" ? { afterTs } : {}),
  };
}

function mapChatHistoryApiInput(query: {
  chatKey?: string;
  contextId?: string;
  limit?: string;
  direction?: string;
  beforeTs?: string;
  afterTs?: string;
}): ChatHistoryActionPayload {
  const direction = readHistoryDirectionOrThrow(String(query.direction || ""));
  const limitText = String(query.limit || "").trim();
  const limit = limitText
    ? parsePositiveIntOptionOrThrow(limitText, "limit")
    : undefined;
  const beforeTs = parseOptionalTimestampOrThrow(
    String(query.beforeTs || ""),
    "beforeTs",
  );
  const afterTs = parseOptionalTimestampOrThrow(
    String(query.afterTs || ""),
    "afterTs",
  );
  if (
    typeof beforeTs === "number" &&
    typeof afterTs === "number" &&
    afterTs >= beforeTs
  ) {
    throw new Error("Invalid range: afterTs must be less than beforeTs.");
  }

  const chatKey = String(query.chatKey || "").trim();
  const contextId = String(query.contextId || "").trim();
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(contextId ? { contextId } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(direction ? { direction } : {}),
    ...(typeof beforeTs === "number" ? { beforeTs } : {}),
    ...(typeof afterTs === "number" ? { afterTs } : {}),
  };
}

function toChatHistoryView(events: ChatHistoryEventV1[]): JsonObject[] {
  return events.map((event) => ({
    ...event,
    isoTime: new Date(event.ts).toISOString(),
  })) as JsonObject[];
}

/**
 * 解析 `chat send` 的命令输入。
 *
 * 关键点（中文）
 * - `--text / --stdin / --text-file` 三选一
 * - 文本读取失败直接抛错，由上层统一输出
 */
async function mapChatSendCommandInput(
  input: ServiceActionCommandInput,
): Promise<ChatSendActionPayload> {
  const explicitText = getStringOpt(input.opts, "text");
  const useStdin = getBooleanOpt(input.opts, "stdin");
  const textFile = getStringOpt(input.opts, "textFile");
  const inputSourcesCount =
    (explicitText ? 1 : 0) + (useStdin ? 1 : 0) + (textFile ? 1 : 0);

  if (inputSourcesCount !== 1) {
    throw new Error(
      "Exactly one text source is required: use one of --text, --stdin, or --text-file.",
    );
  }

  let text = explicitText;
  if (useStdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    text = Buffer.concat(chunks).toString("utf8");
  } else if (textFile) {
    const filePath = path.resolve(process.cwd(), textFile);
    text = await fs.readFile(filePath, "utf8");
  }

  const chatKey = resolveChatKey({
    chatKey: getStringOpt(input.opts, "chatKey"),
  });
  const delayRaw = getStringOpt(input.opts, "delay");
  const timeRaw = getStringOpt(input.opts, "time");
  const replyToMessage = getBooleanOpt(input.opts, "reply");
  const delayMs = delayRaw
    ? parseNonNegativeIntOptionOrThrow(delayRaw, "delay")
    : undefined;
  const sendAtMs = timeRaw ? parseSendTimeOptionOrThrow(timeRaw, "time") : undefined;
  if (typeof delayMs === "number" && typeof sendAtMs === "number") {
    throw new Error("`--delay` and `--time` cannot be used together.");
  }
  if (!chatKey) {
    throw new Error(
      "Missing chatKey. Provide --chat-key or ensure SMA_CTX_CHAT_KEY is injected in current shell context.",
    );
  }

  return {
    text,
    chatKey,
    ...(typeof delayMs === "number" ? { delayMs } : {}),
    ...(typeof sendAtMs === "number" ? { sendAtMs } : {}),
    ...(replyToMessage ? { replyToMessage: true } : {}),
  };
}

function mapChatSendApiInput(body: JsonValue): ChatSendActionPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid JSON body");
  }
  const payload = body as JsonObject;
  const delayRaw = payload.delayMs ?? payload.delay;
  const timeRaw = payload.sendAtMs ?? payload.sendAt ?? payload.time;
  const replyRaw = payload.replyToMessage ?? payload.reply;
  const delayText =
    typeof delayRaw === "string" || typeof delayRaw === "number"
      ? String(delayRaw).trim()
      : "";
  const timeText =
    typeof timeRaw === "string" || typeof timeRaw === "number"
      ? String(timeRaw).trim()
      : "";
  const delayMs = delayText
    ? parseNonNegativeIntOptionOrThrow(delayText, "delayMs")
    : undefined;
  const sendAtMs = timeText
    ? parseSendTimeOptionOrThrow(timeText, "sendAtMs")
    : undefined;
  if (typeof delayMs === "number" && typeof sendAtMs === "number") {
    throw new Error("`delayMs` and `sendAtMs` cannot be used together.");
  }
  return {
    text: String(payload.text ?? ""),
    chatKey:
      typeof payload.chatKey === "string" ? payload.chatKey.trim() : undefined,
    ...(typeof delayMs === "number" ? { delayMs } : {}),
    ...(typeof sendAtMs === "number" ? { sendAtMs } : {}),
    ...(replyRaw === true ? { replyToMessage: true } : {}),
  };
}

async function executeChatSendAction(params: {
  context: ServiceRuntime;
  payload: ChatSendActionPayload;
}) {
  const chatKey = resolveChatKey({
    chatKey: params.payload.chatKey,
    context: params.context,
  });
  if (!chatKey) {
    return {
      success: false,
      error: "Missing chatKey",
    };
  }

  const result = await sendChatTextByChatKey({
    context: params.context,
    chatKey,
    text: String(params.payload.text || ""),
    delayMs: params.payload.delayMs,
    sendAtMs: params.payload.sendAtMs,
    replyToMessage: params.payload.replyToMessage === true,
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error || "chat send failed",
    };
  }
  return {
    success: true,
    data: {
      chatKey: result.chatKey || chatKey,
    },
  };
}

function mapChatReactCommandInput(
  input: ServiceActionCommandInput,
): ChatReactActionPayload {
  const chatKey = resolveChatKey({
    chatKey: getStringOpt(input.opts, "chatKey"),
  });
  if (!chatKey) {
    throw new Error(
      "Missing chatKey. Provide --chat-key or ensure SMA_CTX_CHAT_KEY is injected in current shell context.",
    );
  }

  const emoji = getStringOpt(input.opts, "emoji");
  const messageId = getStringOpt(input.opts, "messageId");
  const big = getBooleanOpt(input.opts, "big");
  return {
    chatKey,
    ...(emoji ? { emoji } : {}),
    ...(messageId ? { messageId } : {}),
    ...(big ? { big: true } : {}),
  };
}

function mapChatReactApiInput(body: JsonValue): ChatReactActionPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid JSON body");
  }
  const payload = body as JsonObject;
  const chatKey =
    typeof payload.chatKey === "string" ? payload.chatKey.trim() : undefined;
  const emoji = typeof payload.emoji === "string" ? payload.emoji.trim() : undefined;
  const messageId =
    typeof payload.messageId === "string" || typeof payload.messageId === "number"
      ? String(payload.messageId).trim()
      : undefined;
  const big = payload.big === true;
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(emoji ? { emoji } : {}),
    ...(messageId ? { messageId } : {}),
    ...(big ? { big: true } : {}),
  };
}

async function executeChatReactAction(params: {
  context: ServiceRuntime;
  payload: ChatReactActionPayload;
}) {
  const chatKey = resolveChatKey({
    chatKey: params.payload.chatKey,
    context: params.context,
  });
  if (!chatKey) {
    return {
      success: false,
      error: "Missing chatKey",
    };
  }

  const messageId = String(params.payload.messageId || "").trim() || undefined;
  const result = await sendChatActionByChatKey({
    context: params.context,
    chatKey,
    action: "react",
    messageId,
    reactionEmoji: params.payload.emoji,
    reactionIsBig: params.payload.big === true,
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error || "chat react failed",
    };
  }
  return {
    success: true,
    data: {
      chatKey: result.chatKey || chatKey,
      ...(messageId ? { messageId } : {}),
      ...(typeof params.payload.emoji === "string" && params.payload.emoji.trim()
        ? { emoji: params.payload.emoji.trim() }
        : {}),
      ...(params.payload.big === true ? { big: true } : {}),
    },
  };
}

export const chatService: Service = {
  name: "chat",
  system: (context) => {
    const method = resolveChatMethod(context.config);
    return [CHAT_SERVICE_PROMPTS[method], ...buildEnabledChannelPrompts(context, method)]
      .filter(Boolean)
      .join("\n\n");
  },
  actions: {
    status: {
      command: {
        description: "查看 chat 渠道连接状态",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "GET",
        mapInput(c) {
          return mapChatChannelApiQueryInput({
            channel: c.req.query("channel"),
          });
        },
      },
      async execute(params) {
        return executeChatStatusAction({
          context: params.context,
          payload: params.payload as ChatStatusActionPayload,
        });
      },
    },
    test: {
      command: {
        description: "测试 chat 渠道连通性",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatChannelApiInput(await c.req.json().catch(() => ({})));
        },
      },
      async execute(params) {
        return executeChatTestAction({
          context: params.context,
          payload: params.payload as ChatTestActionPayload,
        });
      },
    },
    reconnect: {
      command: {
        description: "重连 chat 渠道（默认全部）",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatChannelApiInput(await c.req.json().catch(() => ({})));
        },
      },
      async execute(params) {
        return executeChatReconnectAction({
          context: params.context,
          payload: params.payload as ChatReconnectActionPayload,
        });
      },
    },
    open: {
      command: {
        description: "打开 chat 渠道（enabled=true，已配置则尝试启动）",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatChannelApiInput(await c.req.json().catch(() => ({})));
        },
      },
      async execute(params) {
        return executeChatOpenAction({
          context: params.context,
          payload: params.payload as ChatOpenActionPayload,
        });
      },
    },
    close: {
      command: {
        description: "关闭 chat 渠道（enabled=false，并停止运行）",
        configure(command: Command) {
          command.option("--channel <name>", "指定渠道（telegram|feishu|qq）");
        },
        mapInput: mapChatChannelCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatChannelApiInput(await c.req.json().catch(() => ({})));
        },
      },
      async execute(params) {
        return executeChatCloseAction({
          context: params.context,
          payload: params.payload as ChatCloseActionPayload,
        });
      },
    },
    configure: {
      command: {
        description: "更新 chat 渠道参数（写入 ship.json，可选立即重载）",
        configure(command: Command) {
          command
            .requiredOption("--channel <name>", "指定渠道（telegram|feishu|qq）")
            .requiredOption(
              "--config-json <json>",
              "配置 patch JSON（例如 '{\"appId\":\"xxx\",\"sandbox\":false}'）",
            )
            .option("--restart", "配置后立即重载渠道", false);
        },
        mapInput: mapChatConfigureCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatConfigureApiInput(c);
        },
      },
      async execute(params) {
        return executeChatConfigureAction({
          context: params.context,
          payload: params.payload as ChatConfigureActionPayload,
        });
      },
    },
    send: {
      command: {
        description: "发送消息到目标 chatKey",
        configure(command: Command) {
          command
            .option("--text <text>", "消息正文")
            .option("--stdin", "从标准输入读取消息正文", false)
            .option("--text-file <file>", "从文件读取消息正文（相对当前目录）")
            .option("--delay <ms>", "延迟发送毫秒数（非负整数）")
            .option(
              "--time <time>",
              "定时发送时间（Unix 时间戳秒/毫秒或 ISO 时间）",
            )
            .option("--reply", "显式使用 reply_to_message 回复目标消息", false)
            .option(
              "--chat-key <chatKey>",
              "目标 chatKey（不传则尝试读取 SMA_CTX_CHAT_KEY）",
            );
        },
        mapInput: mapChatSendCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatSendApiInput(await c.req.json());
        },
      },
      async execute(params) {
        return executeChatSendAction({
          context: params.context,
          payload: params.payload as ChatSendActionPayload,
        });
      },
    },
    react: {
      command: {
        description: "给目标消息贴表情（当前仅 Telegram 支持）",
        configure(command: Command) {
          command
            .option("--emoji <emoji>", "表情字符（默认 👍）")
            .option("--big", "使用大表情效果（Telegram is_big）", false)
            .option("--message-id <id>", "目标消息 ID（默认尝试从 chat meta 回填）")
            .option(
              "--chat-key <chatKey>",
              "目标 chatKey（不传则尝试读取 SMA_CTX_CHAT_KEY）",
            );
        },
        mapInput: mapChatReactCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatReactApiInput(await c.req.json());
        },
      },
      async execute(params) {
        return executeChatReactAction({
          context: params.context,
          payload: params.payload as ChatReactActionPayload,
        });
      },
    },
    context: {
      command: {
        description: "查看当前会话上下文快照",
        configure(command: Command) {
          command.option("--chat-key <chatKey>", "显式覆盖 chatKey");
        },
        mapInput(input) {
          const chatKey = getStringOpt(input.opts, "chatKey");
          return {
            ...(chatKey ? { chatKey } : {}),
          };
        },
      },
      api: {
        method: "GET",
        mapInput(c) {
          const chatKey = String(c.req.query("chatKey") || "").trim();
          const contextId = String(c.req.query("contextId") || "").trim();
          return {
            ...(chatKey ? { chatKey } : {}),
            ...(contextId ? { contextId } : {}),
          };
        },
      },
      async execute(params) {
        const payload = params.payload as ChatContextActionPayload;
        const snapshot = resolveChatContextSnapshot({
          context: params.context,
          ...(payload.chatKey ? { chatKey: payload.chatKey } : {}),
          ...(payload.contextId ? { contextId: payload.contextId } : {}),
        });
        return {
          success: true,
          data: {
            context: snapshot,
          },
        };
      },
    },
    history: {
      command: {
        description: "读取 chat 历史消息（默认最近 30 条）",
        configure(command: Command) {
          command
            .option("--chat-key <chatKey>", "显式覆盖 chatKey")
            .option("--context-id <contextId>", "显式覆盖 contextId")
            .option("--limit <n>", "返回最近 N 条（默认 30）")
            .option(
              "--direction <direction>",
              "方向过滤（all|inbound|outbound）",
            )
            .option("--before-ts <ts>", "仅返回 ts 小于该值的记录（毫秒）")
            .option("--after-ts <ts>", "仅返回 ts 大于该值的记录（毫秒）");
        },
        mapInput: mapChatHistoryCommandInput,
      },
      api: {
        method: "GET",
        mapInput(c) {
          return mapChatHistoryApiInput({
            chatKey: c.req.query("chatKey"),
            contextId: c.req.query("contextId"),
            limit: c.req.query("limit"),
            direction: c.req.query("direction"),
            beforeTs: c.req.query("beforeTs"),
            afterTs: c.req.query("afterTs"),
          });
        },
      },
      async execute(params) {
        const payload = params.payload as ChatHistoryActionPayload;
        const snapshot = resolveChatContextSnapshot({
          context: params.context,
          ...(payload.chatKey ? { chatKey: payload.chatKey } : {}),
          ...(payload.contextId ? { contextId: payload.contextId } : {}),
        });
        const explicitContextId = String(payload.contextId || "").trim();
        const explicitChatKey = String(payload.chatKey || "").trim();
        // 关键点（中文）：history 查询优先显式参数，避免被当前请求上下文的 contextId 覆盖。
        const contextId = String(
          explicitContextId || explicitChatKey || snapshot.contextId || "",
        ).trim();
        if (!contextId) {
          return {
            success: false,
            error:
              "Missing contextId. Provide --context-id/--chat-key or ensure SMA_CTX_CONTEXT_ID is injected.",
          };
        }

        const historyResult = await readChatHistory({
          context: params.context,
          contextId,
          limit: payload.limit,
          direction: payload.direction || "all",
          beforeTs: payload.beforeTs,
          afterTs: payload.afterTs,
        });
        const historyPath = path
          .relative(params.context.rootPath, historyResult.historyPath)
          .split(path.sep)
          .join("/");

        return {
          success: true,
          data: {
            context: snapshot,
            historyPath,
            count: historyResult.events.length,
            events: toChatHistoryView(historyResult.events),
          },
        };
      },
    },
  },
  lifecycle: {
    async start(context) {
      await startChatChannels(context);
    },
    async stop() {
      await stopChatChannels();
    },
  },
};
