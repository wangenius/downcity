/**
 * ChatChannelConfig：chat 渠道配置与状态快照模块。
 *
 * 关键点（中文）
 * - 渠道配置摘要、状态快照、patch 归一化、downcity.json 落盘都收敛在这里。
 * - 所有配置写入都遵循“先改内存，再落盘”的一致性顺序。
 * - 该模块不直接负责 action 流程控制，只提供可复用的底层能力。
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { StoredChannelAccount } from "@/types/Store.js";
import type {
  ChatChannelName,
  ChatChannelStateSnapshot,
} from "@services/chat/types/ChannelStatus.js";
import type { ChatChannelConfigurationField } from "@services/chat/types/ChannelConfiguration.js";
import type { ChatChannelState } from "@/types/ChatRuntime.js";
import {
  getChatChannelConfiguration,
  listChatChannelConfigurations,
} from "@services/chat/channels/ConfigurationRegistry.js";
import {
  getChatChannelBot,
  isChannelAccountConfigured,
  resolveChannelAccount,
  resolveChannelAccountId,
} from "./ChatChannelCore.js";

function toJsonObject(input: unknown): JsonObject {
  return JSON.parse(JSON.stringify(input)) as JsonObject;
}

/**
 * 生成可安全暴露给 UI 的渠道配置摘要。
 *
 * 关键点（中文）
 * - 不返回明文密钥，只返回布尔“是否已配置”。
 * - 字段命名尽量贴近 `downcity.json`，便于前端直接映射编辑。
 */
export function buildChatChannelConfigSummary(
  context: ExecutionContext,
  channel: ChatChannelName,
  accountInput?: StoredChannelAccount | null,
): Record<string, string | number | boolean | null> {
  const account = accountInput ?? resolveChannelAccount(context, channel);
  const channelAccountId = resolveChannelAccountId(context, channel);
  const configured = isChannelAccountConfigured(channel, account);
  const channels = context.config.services?.chat?.channels;
  if (channel === "telegram") {
    const cfg = channels?.telegram;
    return {
      enabled: cfg?.enabled === true,
      channelAccountId: channelAccountId || null,
      channelAccountConfigured: configured,
    };
  }
  if (channel === "feishu") {
    const cfg = channels?.feishu;
    return {
      enabled: cfg?.enabled === true,
      channelAccountId: channelAccountId || null,
      channelAccountConfigured: configured,
    };
  }
  const cfg = channels?.qq;
  return {
    enabled: cfg?.enabled === true,
    channelAccountId: channelAccountId || null,
    channelAccountConfigured: configured,
  };
}

/**
 * 读取单个渠道状态快照。
 */
export function getChatChannelStatus(
  state: ChatChannelState,
  context: ExecutionContext,
  channel: ChatChannelName,
): ChatChannelStateSnapshot {
  const channels = context.config.services?.chat?.channels || {};
  const enabled = channels[channel]?.enabled === true;
  const channelAccount = resolveChannelAccount(context, channel);
  const configured = isChannelAccountConfigured(channel, channelAccount);

  const runtime = getChatChannelBot(state, channel)?.getRuntimeStatus();
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
      config: buildChatChannelConfigSummary(context, channel, channelAccount),
      configuration: toJsonObject(getChatChannelConfiguration(channel).describe()),
    },
  };
}

/**
 * 更新内存配置与 downcity.json 中的 channel enabled 状态。
 */
export async function setChatChannelEnabled(params: {
  context: ExecutionContext;
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

  const shipPath = path.join(context.rootPath, "downcity.json");
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

function readOptionalNumberPatch(value: JsonValue): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    const parsed = Number(text);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizePatchFieldValue(params: {
  field: ChatChannelConfigurationField;
  value: JsonValue;
}): string | number | boolean | null | undefined {
  const { field, value } = params;

  if (field.type === "boolean") {
    if (value === null) return field.nullable ? null : undefined;
    return readOptionalBooleanPatch(value);
  }

  if (field.type === "number") {
    const normalized = readOptionalNumberPatch(value);
    if (normalized === null) {
      return field.nullable ? null : undefined;
    }
    return normalized;
  }

  const normalizedText = readOptionalStringPatch(value);
  if (normalizedText === null) {
    return field.nullable ? null : undefined;
  }
  if (normalizedText === undefined) {
    return undefined;
  }

  if (field.type === "enum" && Array.isArray(field.options) && field.options.length > 0) {
    const allowed = new Set(
      field.options.map((item) => String(item.value || "").trim()).filter(Boolean),
    );
    if (!allowed.has(normalizedText)) {
      throw new Error(
        `Invalid value for ${field.key}: ${normalizedText}. Allowed: ${[...allowed].join(", ")}`,
      );
    }
  }
  return normalizedText;
}

/**
 * 解析 chat.configure patch。
 */
export function normalizeChatChannelConfigPatch(params: {
  channel: ChatChannelName;
  config: Record<string, JsonValue>;
}): Record<string, string | number | boolean | null> {
  const configDefinition = getChatChannelConfiguration(params.channel);
  const writableFields = configDefinition.getWritableShipFields();
  const patch: Record<string, string | number | boolean | null> = {};

  for (const field of writableFields) {
    if (!Object.prototype.hasOwnProperty.call(params.config, field.key)) continue;
    const rawValue = params.config[field.key];
    const normalizedValue = normalizePatchFieldValue({
      field,
      value: rawValue,
    });
    if (normalizedValue === undefined) continue;
    patch[field.key] = normalizedValue;
  }
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
 * 更新单个 channel 配置（内存 + downcity.json）。
 */
export async function setChatChannelConfig(params: {
  context: ExecutionContext;
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

  const shipPath = path.join(context.rootPath, "downcity.json");
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

/**
 * 读取渠道 configuration 描述。
 */
export function describeChatChannelConfiguration(channel: ChatChannelName): JsonObject {
  return toJsonObject(getChatChannelConfiguration(channel).describe());
}

/**
 * 读取全部渠道 configuration 描述。
 */
export function listChatChannelConfigurationDescriptions(): JsonObject[] {
  return listChatChannelConfigurations().map((item) => toJsonObject(item.describe()));
}

/**
 * 判断输入是否为 JSON object。
 */
export function isChatChannelConfigObject(value: JsonValue): value is JsonObject {
  return isJsonObject(value);
}
