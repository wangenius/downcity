/**
 * Chat 授权判定逻辑。
 *
 * 关键点（中文）
 * - 设计目标参考 openclaw：区分 DM / 群聊策略、allowlist 与 pairing。
 * - 这里只负责纯判定，不触碰 IO；配套的动态请求落盘由 AuthorizationStore 负责。
 */

import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type {
  ChatAuthorizationConfig,
  ChatAuthorizationEvaluateInput,
  ChatAuthorizationEvaluateResult,
  ChatChannelAuthorizationConfig,
} from "@services/chat/types/Authorization.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";

function normalizeText(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text ? text : undefined;
}

function normalizeList(values: unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeText(value)).filter(Boolean) as string[];
}

function resolveChannelAuthorizationConfig(
  config: ShipConfig,
  channel: ChatDispatchChannel,
  authorizationConfig?: ChatAuthorizationConfig,
): ChatChannelAuthorizationConfig {
  const raw = authorizationConfig?.channels?.[channel];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw;
}

function isDirectMessage(channel: ChatDispatchChannel, chatType?: string): boolean {
  const type = String(chatType || "").trim().toLowerCase();
  if (!type) return true;
  if (channel === "telegram") {
    return type === "private";
  }
  if (channel === "feishu") {
    return type === "p2p";
  }
  if (channel === "qq") {
    return type === "private";
  }
  return false;
}

/**
 * 读取当前渠道 owner 列表。
 *
 * 关键点（中文）
 * - 新授权模型优先读取 console `ship.db` 中的 ownerIds。
 * - 为兼容旧版配置，若 ownerIds 为空则回退到 legacy channel account authId。
 */
export function resolveOwnerIdsForChannel(params: {
  config: ShipConfig;
  channel: ChatDispatchChannel;
  env?: Record<string, string>;
  authorizationConfig?: ChatAuthorizationConfig;
}): string[] {
  const cfg = resolveChannelAuthorizationConfig(
    params.config,
    params.channel,
    params.authorizationConfig,
  );
  const explicitOwnerIds = normalizeList(cfg.ownerIds);
  if (explicitOwnerIds.length > 0) return explicitOwnerIds;

  const legacyEnvKey =
    params.channel === "telegram"
      ? "TELEGRAM_AUTH_ID"
      : params.channel === "feishu"
        ? "FEISHU_AUTH_ID"
        : "QQ_AUTH_ID";
  const legacyOwnerId = normalizeText(params.env?.[legacyEnvKey]);
  return legacyOwnerId ? [legacyOwnerId] : [];
}

/**
 * 解析 owner 身份。
 */
export function resolveOwnerMatch(params: {
  config: ShipConfig;
  channel: ChatDispatchChannel;
  env?: Record<string, string>;
  userId?: string;
  authorizationConfig?: ChatAuthorizationConfig;
}): "master" | "guest" | "unknown" {
  const userId = normalizeText(params.userId);
  if (!userId) return "unknown";
  const ownerIds = resolveOwnerIdsForChannel(params);
  if (ownerIds.length === 0) return "guest";
  return ownerIds.includes(userId) ? "master" : "guest";
}

/**
 * 执行入站授权判定。
 */
export function evaluateIncomingChatAuthorization(params: {
  config: ShipConfig;
  channel: ChatDispatchChannel;
  input: ChatAuthorizationEvaluateInput;
  authorizationConfig?: ChatAuthorizationConfig;
}): ChatAuthorizationEvaluateResult {
  const cfg = resolveChannelAuthorizationConfig(
    params.config,
    params.channel,
    params.authorizationConfig,
  );
  const userId = normalizeText(params.input.userId);
  const chatId = normalizeText(params.input.chatId);
  const chatType = normalizeText(params.input.chatType);
  const direct = isDirectMessage(params.channel, chatType);
  const ownerIds = normalizeList(cfg.ownerIds);
  const allowFrom = normalizeList(cfg.allowFrom);
  const groupAllowFrom = normalizeList(cfg.groupAllowFrom);
  const isOwner = !!(userId && ownerIds.includes(userId));
  const isAllowedUser = !!(userId && allowFrom.includes(userId));
  const dmPolicy = cfg.dmPolicy || "pairing";
  const groupPolicy = cfg.groupPolicy || "allowlist";

  if (direct) {
    if (dmPolicy === "disabled") {
      return {
        decision: "block",
        isOwner,
        reason: "dm_policy_disabled",
      };
    }
    if (dmPolicy === "open") {
      return {
        decision: "allow",
        isOwner,
        reason: "dm_policy_open",
      };
    }
    if (isOwner || isAllowedUser) {
      return {
        decision: "allow",
        isOwner,
        reason: isOwner ? "owner_allowed" : "allowlist_allowed",
      };
    }
    if (dmPolicy === "pairing") {
      return {
        decision: "pairing",
        isOwner,
        reason: "dm_policy_pairing_required",
      };
    }
    return {
      decision: "block",
      isOwner,
      reason: "dm_policy_allowlist_blocked",
    };
  }

  if (groupPolicy === "disabled") {
    return {
      decision: "block",
      isOwner,
      reason: "group_policy_disabled",
    };
  }

  if (groupPolicy === "allowlist") {
    if (!chatId || !groupAllowFrom.includes(chatId)) {
      return {
        decision: "block",
        isOwner,
        reason: "group_not_in_allowlist",
      };
    }
  }

  const groupConfig =
    chatId && cfg.groups && typeof cfg.groups === "object" ? cfg.groups[chatId] : undefined;
  const groupUserAllowFrom = normalizeList(groupConfig?.allowFrom);
  if (groupUserAllowFrom.length > 0) {
    if (!userId || !groupUserAllowFrom.includes(userId)) {
      return {
        decision: "block",
        isOwner,
        reason: "group_user_not_in_allowlist",
      };
    }
  }

  return {
    decision: "allow",
    isOwner,
    reason:
      groupPolicy === "open"
        ? "group_policy_open"
        : groupUserAllowFrom.length > 0
          ? "group_allowlist_and_user_allowlist_allowed"
          : "group_allowlist_allowed",
  };
}
