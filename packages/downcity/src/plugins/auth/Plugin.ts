/**
 * Auth Plugin。
 *
 * 关键点（中文）
 * - auth 是内建且必需的 plugin，不走可选启停语义。
 * - 所有 chat 授权配置仍然保存在 `downcity.db`，动态观测态仍落 `.downcity/chat/authorization/state.json`。
 * - plugin 只负责统一暴露 plugin 点 / action 边界，不改变底层存储模型。
 */

import type { Plugin } from "@/types/Plugin.js";
import type { JsonValue } from "@/types/Json.js";
import { CHAT_PLUGIN_POINTS } from "@services/chat/runtime/PluginPoints.js";
import {
  AUTH_ACTIONS,
  type AuthObservePrincipalPayload,
  type AuthSetUserRolePayload,
  type AuthWriteConfigPayload,
  type ChatAuthorizationConfig,
  type ChatAuthorizationEvaluateInput,
  type ChatAuthorizationSnapshot,
} from "@/types/AuthPlugin.js";
import {
  readChatAuthorizationConfig,
  setChatAuthorizationUserRole,
  writeChatAuthorizationConfig,
} from "@/plugins/auth/runtime/AuthorizationConfig.js";
import {
  evaluateIncomingChatAuthorization,
  resolveAuthorizedUserRole,
} from "@/plugins/auth/runtime/AuthorizationPolicy.js";
import {
  readAuthorizationSnapshot,
  recordObservedAuthorizationPrincipal,
} from "@/plugins/auth/runtime/AuthorizationStore.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";

function toChannel(value: unknown): ChatDispatchChannel | null {
  const text = String(value || "").trim().toLowerCase();
  if (text === "telegram" || text === "feishu" || text === "qq") return text;
  return null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toEvaluateInput(payload: Record<string, unknown>): ChatAuthorizationEvaluateInput {
  const channel = toChannel(payload.channel);
  if (!channel) {
    throw new Error("auth.authorize_incoming requires a valid channel");
  }
  return {
    channel,
    chatId: String(payload.chatId || "").trim(),
    ...(typeof payload.chatType === "string" ? { chatType: payload.chatType.trim() } : {}),
    ...(typeof payload.userId === "string" ? { userId: payload.userId.trim() } : {}),
    ...(typeof payload.username === "string" ? { username: payload.username.trim() } : {}),
    ...(typeof payload.chatTitle === "string" ? { chatTitle: payload.chatTitle.trim() } : {}),
  };
}

function toSnapshotData(snapshot: ChatAuthorizationSnapshot): JsonValue {
  return {
    config: snapshot.config as unknown as JsonValue,
    users: snapshot.users as unknown as JsonValue,
    chats: snapshot.chats as unknown as JsonValue,
  };
}

/**
 * authPlugin：统一承载授权能力。
 */
export const authPlugin: Plugin = {
  name: "auth",
  title: "User Authorization System",
  description:
    "Controls who can talk to the agent in chat channels, records observed users and chats, and resolves each user's effective role for downstream service decisions.",
  availability() {
    return {
      enabled: true,
      available: true,
      reasons: [],
    };
  },
  hooks: {
    guard: {
      [CHAT_PLUGIN_POINTS.authorizeIncoming]: [
        async ({ runtime, value }) => {
          const input =
            value && typeof value === "object" && !Array.isArray(value)
              ? (value as Record<string, unknown>)
              : {};
          const evaluateInput = toEvaluateInput(input);
          const authorizationConfig = readChatAuthorizationConfig(runtime);
          const result = evaluateIncomingChatAuthorization({
            config: runtime.config,
            channel: evaluateInput.channel,
            input: evaluateInput,
            authorizationConfig,
          });
          if (result.decision !== "allow") {
            throw new Error(result.reason || "chat authorization blocked");
          }
        },
      ],
    },
    effect: {
      [CHAT_PLUGIN_POINTS.observePrincipal]: [
        async ({ runtime, value }) => {
          const input = toRecord(value) as unknown as AuthObservePrincipalPayload;
          const channel = toChannel(input.channel);
          if (!channel) {
            throw new Error("chat.observePrincipal requires a valid channel");
          }
          await recordObservedAuthorizationPrincipal({
            context: runtime,
            channel,
            chatId: String(input.chatId || "").trim(),
            ...(typeof input.chatType === "string" ? { chatType: input.chatType.trim() } : {}),
            ...(typeof input.chatTitle === "string" ? { chatTitle: input.chatTitle.trim() } : {}),
            ...(typeof input.userId === "string" ? { userId: input.userId.trim() } : {}),
            ...(typeof input.username === "string" ? { username: input.username.trim() } : {}),
          });
        },
      ],
    },
  },
  resolves: {
    [CHAT_PLUGIN_POINTS.resolveUserRole]: async ({ runtime, value }) => {
      const input =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      const channel = toChannel(input.channel);
      if (!channel) {
        throw new Error("chat.resolveUserRole requires a valid channel");
      }
      const role = resolveAuthorizedUserRole({
        channel,
        userId: String(input.userId || "").trim(),
        rootPath: runtime.rootPath,
      });
      return ((role || null) as unknown) as JsonValue;
    },
  },
  actions: {
    [AUTH_ACTIONS.snapshot]: {
      execute: async ({ runtime }) => {
        const snapshot = await readAuthorizationSnapshot({
          context: runtime,
        });
        return {
          success: true,
          data: toSnapshotData(snapshot),
        };
      },
    },
    [AUTH_ACTIONS.readConfig]: {
      execute: async ({ runtime }) => {
        return {
          success: true,
          data: readChatAuthorizationConfig(runtime) as unknown as JsonValue,
        };
      },
    },
    [AUTH_ACTIONS.writeConfig]: {
      execute: async ({ runtime, payload }) => {
        const body = toRecord(payload) as unknown as AuthWriteConfigPayload;
        const nextConfig =
          body.config && typeof body.config === "object" && !Array.isArray(body.config)
            ? (body.config as ChatAuthorizationConfig)
            : {};
        await writeChatAuthorizationConfig({
          context: runtime,
          nextConfig,
        });
        return {
          success: true,
          data: readChatAuthorizationConfig(runtime) as unknown as JsonValue,
        };
      },
    },
    [AUTH_ACTIONS.setUserRole]: {
      execute: async ({ runtime, payload }) => {
        const body = toRecord(payload) as unknown as AuthSetUserRolePayload;
        const channel = toChannel(body.channel);
        if (!channel) {
          return {
            success: false,
            error: "set-user-role requires a valid channel",
            message: "set-user-role requires a valid channel",
          };
        }
        await setChatAuthorizationUserRole({
          context: runtime,
          channel,
          userId: String(body.userId || "").trim(),
          roleId: String(body.roleId || "").trim(),
        });
        return {
          success: true,
          data: readChatAuthorizationConfig(runtime) as unknown as JsonValue,
        };
      },
    },
  },
};
