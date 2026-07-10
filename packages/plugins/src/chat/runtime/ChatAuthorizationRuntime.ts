/**
 * ChatAuthorizationRuntime：ChatPlugin 内置授权能力。
 *
 * 关键点（中文）
 * - 授权能力归属于 ChatPlugin，不再作为独立 plugin 注册。
 * - chat runtime 仍通过通用 plugin hook / resolve 点调用，保持执行链路统一。
 * - action 名称统一带 `authorization-` 前缀，避免和 chat 会话动作混淆。
 */

import type {
  PluginActions,
  PluginHooks,
  PluginResolves,
} from "@downcity/agent";
import { createAction } from "@downcity/agent";
import { z } from "zod";
import type { JsonValue } from "@downcity/agent";
import { CHAT_PLUGIN_POINTS } from "@/chat/runtime/PluginPoints.js";
import type { ChatDispatchChannel } from "@/chat/types/ChatDispatcher.js";
import {
  CHAT_AUTHORIZATION_ACTIONS,
  CHAT_AUTHORIZATION_CATALOG,
  type ChatAuthorizationConfig,
  type ChatAuthorizationEvaluateInput,
  type ChatAuthorizationObservePrincipalPayload,
  type ChatAuthorizationSetUserRolePayload,
  type ChatAuthorizationSnapshot,
  type ChatAuthorizationWriteConfigPayload,
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
    throw new Error("chat.authorizeIncoming requires a valid channel");
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

/**
 * 创建 ChatPlugin 内置授权 hooks。
 */
export function createChatAuthorizationHooks(): PluginHooks {
  return {
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
  };
}

/**
 * 创建 ChatPlugin 内置授权 resolve 点。
 */
export function createChatAuthorizationResolves(): PluginResolves {
  return {
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
  };
}

/**
 * 创建 ChatPlugin 内置授权 actions。
 */
export function createChatAuthorizationActions(): PluginActions {
  return {
    [CHAT_AUTHORIZATION_ACTIONS.snapshot]: createAction({
      description: "Read chat authorization snapshot (catalog/config/users/chats).",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {} },
      },
      execute: async ({ context }) => {
        const snapshot = await readAuthorizationSnapshot({
          context,
        });
        return {
          success: true,
          data: toSnapshotData(snapshot),
        };
      },
    }),
    [CHAT_AUTHORIZATION_ACTIONS.readConfig]: createAction({
      description: "Read current chat authorization config.",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {} },
      },
      execute: async ({ context }) => {
        return {
          success: true,
          data: readChatAuthorizationConfig(context) as unknown as JsonValue,
        };
      },
    }),
    [CHAT_AUTHORIZATION_ACTIONS.writeConfig]: createAction({
      description: "Write chat authorization config as a full replacement.",
      input_schema: {
        zod: z.object({
          config: z.record(z.string(), z.unknown()).optional(),
        }),
        json_schema: {
          type: "object",
          properties: {
            config: { type: "object", description: "Authorization config." },
          },
        },
      },
      execute: async ({ context, input }) => {
        const body = toRecord(
          input,
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
    }),
    [CHAT_AUTHORIZATION_ACTIONS.setUserRole]: createAction({
      description: "Set the role for a channel user.",
      input_schema: {
        zod: z.object({
          channel: z.enum(["telegram", "feishu", "qq"]),
          userId: z.string(),
          roleId: z.string(),
        }),
        json_schema: {
          type: "object",
          required: ["channel", "userId", "roleId"],
          properties: {
            channel: { type: "string", enum: ["telegram", "feishu", "qq"] },
            userId: { type: "string" },
            roleId: { type: "string" },
          },
        },
      },
      execute: async ({ context, input }) => {
        const body = toRecord(
          input,
        ) as unknown as ChatAuthorizationSetUserRolePayload;
        const channel = toChannel(body.channel);
        if (!channel) {
          return {
            success: false,
            error: "authorization-set-user-role requires a valid channel",
            message: "authorization-set-user-role requires a valid channel",
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
    }),
  };
}
