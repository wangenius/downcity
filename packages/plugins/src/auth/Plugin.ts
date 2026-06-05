/**
 * ChatAuthorizationPlugin。
 *
 * 关键点（中文）
 * - chat-authorization 是内建且必需的 plugin，不走可选启停语义。
 * - 静态授权配置与动态观测态都收敛在项目 `.downcity/chat/authorization/`。
 * - 它只负责聊天主体授权，不负责 Town HTTP Bearer token 或路由访问鉴权。
 */

import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { Plugin } from "@downcity/agent/internal/plugin/types/Plugin.js";
import type { JsonValue } from "@downcity/agent/internal/types/common/Json.js";
import { CHAT_PLUGIN_POINTS } from "@/chat/runtime/PluginPoints.js";
import {
  CHAT_AUTHORIZATION_ACTIONS,
  CHAT_AUTHORIZATION_CATALOG,
  CHAT_AUTHORIZATION_PLUGIN_NAME,
  type ChatAuthorizationObservePrincipalPayload,
  type ChatAuthorizationSetUserRolePayload,
  type ChatAuthorizationWriteConfigPayload,
  type ChatAuthorizationConfig,
  type ChatAuthorizationEvaluateInput,
  type ChatAuthorizationSnapshot,
} from "@/auth/types/AuthPlugin.js";
import {
  readChatAuthorizationConfig,
  setChatAuthorizationUserRole,
  writeChatAuthorizationConfig,
} from "@/auth/runtime/AuthorizationConfig.js";
import {
  evaluateIncomingChatAuthorization,
  resolveAuthorizedUserRole,
} from "@/auth/runtime/AuthorizationPolicy.js";
import {
  readAuthorizationSnapshot,
  recordObservedAuthorizationPrincipal,
} from "@/auth/runtime/AuthorizationStore.js";
import type { ChatDispatchChannel } from "@/chat/types/ChatDispatcher.js";

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
    throw new Error("chat-authorization.authorize_incoming requires a valid channel");
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
    catalog: CHAT_AUTHORIZATION_CATALOG as unknown as JsonValue,
    config: snapshot.config as unknown as JsonValue,
    users: snapshot.users as unknown as JsonValue,
    chats: snapshot.chats as unknown as JsonValue,
  };
}

function createChatAuthorizationPluginDefinition(): Plugin {
  return {
    name: CHAT_AUTHORIZATION_PLUGIN_NAME,
    title: "Chat Access",
    description:
      "Controls who can talk to the agent through chat platforms, records observed users and chats, and resolves each user's effective role for downstream service decisions.",
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
          async ({ context, value }) => {
            const input =
              value && typeof value === "object" && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {};
            const evaluateInput = toEvaluateInput(input);
            const authorizationConfig = readChatAuthorizationConfig(context);
            const result = evaluateIncomingChatAuthorization({
              config: context.config,
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
          async ({ context, value }) => {
            const input = toRecord(
              value,
            ) as unknown as ChatAuthorizationObservePrincipalPayload;
            const channel = toChannel(input.channel);
            if (!channel) {
              throw new Error("chat.observePrincipal requires a valid channel");
            }
            await recordObservedAuthorizationPrincipal({
              context,
              channel,
              chatId: String(input.chatId || "").trim(),
              ...(typeof input.chatType === "string"
                ? { chatType: input.chatType.trim() }
                : {}),
              ...(typeof input.chatTitle === "string"
                ? { chatTitle: input.chatTitle.trim() }
                : {}),
              ...(typeof input.userId === "string"
                ? { userId: input.userId.trim() }
                : {}),
              ...(typeof input.username === "string"
                ? { username: input.username.trim() }
                : {}),
            });
          },
        ],
      },
    },
    resolves: {
      [CHAT_PLUGIN_POINTS.resolveUserRole]: async ({ context, value }) => {
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
          rootPath: context.rootPath,
        });
        return ((role || null) as unknown) as JsonValue;
      },
    },
    actions: {
      [CHAT_AUTHORIZATION_ACTIONS.snapshot]: {
        execute: async ({ context }) => {
          const snapshot = await readAuthorizationSnapshot({
            context,
          });
          return {
            success: true,
            data: toSnapshotData(snapshot),
          };
        },
      },
      [CHAT_AUTHORIZATION_ACTIONS.readConfig]: {
        execute: async ({ context }) => {
          return {
            success: true,
            data: readChatAuthorizationConfig(context) as unknown as JsonValue,
          };
        },
      },
      [CHAT_AUTHORIZATION_ACTIONS.writeConfig]: {
        execute: async ({ context, payload }) => {
          const body = toRecord(
            payload,
          ) as unknown as ChatAuthorizationWriteConfigPayload;
          const nextConfig =
            body.config && typeof body.config === "object" && !Array.isArray(body.config)
              ? (body.config as ChatAuthorizationConfig)
              : {};
          await writeChatAuthorizationConfig({
            context,
            nextConfig,
          });
          return {
            success: true,
            data: readChatAuthorizationConfig(context) as unknown as JsonValue,
          };
        },
      },
      [CHAT_AUTHORIZATION_ACTIONS.setUserRole]: {
        execute: async ({ context, payload }) => {
          const body = toRecord(
            payload,
          ) as unknown as ChatAuthorizationSetUserRolePayload;
          const channel = toChannel(body.channel);
          if (!channel) {
            return {
              success: false,
              error: "set-user-role requires a valid channel",
              message: "set-user-role requires a valid channel",
            };
          }
          await setChatAuthorizationUserRole({
            context,
            channel,
            userId: String(body.userId || "").trim(),
            roleId: String(body.roleId || "").trim(),
          });
          return {
            success: true,
            data: readChatAuthorizationConfig(context) as unknown as JsonValue,
          };
        },
      },
    },
  };
}

/**
 * ChatAuthorizationPlugin：统一承载聊天用户授权能力。
 */
export class ChatAuthorizationPlugin extends BasePlugin {
  readonly name = CHAT_AUTHORIZATION_PLUGIN_NAME;

  constructor(agent: AgentRuntime | null = null) {
    super(agent);
    Object.assign(this, createChatAuthorizationPluginDefinition());
  }
}
