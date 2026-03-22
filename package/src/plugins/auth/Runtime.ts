/**
 * Auth Plugin Runtime Helper。
 *
 * 关键点（中文）
 * - 业务侧只依赖这里，不直接耦合 auth plugin action/capability 名称。
 * - chat 主链路优先走 capability；Console / TUI 管理类操作走 action。
 */

import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type { JsonObject } from "@/types/Json.js";
import {
  AUTH_PLUGIN_NAME,
  AUTH_ACTIONS,
  AUTH_CAPABILITIES,
  ChatAuthorizationConfig,
  ChatAuthorizationEvaluateInput,
  ChatAuthorizationEvaluateResult,
  ChatAuthorizationRole,
  ChatAuthorizationSnapshot,
  type AuthObservePrincipalPayload,
  type AuthSetUserRolePayload,
  type AuthWriteConfigPayload,
} from "@/types/AuthPlugin.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function readEvaluateResult(value: unknown): ChatAuthorizationEvaluateResult {
  const record = toRecord(value);
  return {
    decision: String(record.decision || "block") === "allow" ? "allow" : "block",
    isOwner: record.isOwner === true,
    userRoleId: String(record.userRoleId || "default").trim() || "default",
    userPermissions: readStringArray(record.userPermissions) as ChatAuthorizationEvaluateResult["userPermissions"],
    reason: String(record.reason || "unknown").trim() || "unknown",
  };
}

function readSnapshot(value: unknown): ChatAuthorizationSnapshot {
  const record = toRecord(value);
  return {
    config: (toRecord(record.config) as unknown) as ChatAuthorizationConfig,
    users: (Array.isArray(record.users) ? record.users : []) as ChatAuthorizationSnapshot["users"],
    chats: (Array.isArray(record.chats) ? record.chats : []) as ChatAuthorizationSnapshot["chats"],
  };
}

export async function ensureAuthPluginAvailable(runtime: ServiceRuntime): Promise<void> {
  const availability = await runtime.plugins.availability(AUTH_PLUGIN_NAME);
  if (!availability.available) {
    throw new Error(
      `auth plugin unavailable: ${availability.reasons.join("; ") || "unknown reason"}`,
    );
  }
}

export async function observeAuthorizationPrincipalViaPlugin(params: {
  runtime: ServiceRuntime;
  channel: ChatDispatchChannel;
  chatId: string;
  chatType?: string;
  chatTitle?: string;
  userId?: string;
  username?: string;
}): Promise<void> {
  const result = await params.runtime.capabilities.invoke({
    capability: AUTH_CAPABILITIES.observePrincipal,
    payload: {
      channel: params.channel,
      chatId: params.chatId,
      ...(params.chatType ? { chatType: params.chatType } : {}),
      ...(params.chatTitle ? { chatTitle: params.chatTitle } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.username ? { username: params.username } : {}),
    } as AuthObservePrincipalPayload as unknown as JsonObject,
  });
  if (!result.success) {
    throw new Error(result.error || "auth.observe_principal failed");
  }
}

export async function evaluateIncomingAuthorizationViaPlugin(params: {
  runtime: ServiceRuntime;
  channel: ChatDispatchChannel;
  input: ChatAuthorizationEvaluateInput;
}): Promise<ChatAuthorizationEvaluateResult> {
  const result = await params.runtime.capabilities.invoke({
    capability: AUTH_CAPABILITIES.authorizeIncoming,
    payload: {
      channel: params.channel,
      chatId: params.input.chatId,
      ...(params.input.chatType ? { chatType: params.input.chatType } : {}),
      ...(params.input.userId ? { userId: params.input.userId } : {}),
      ...(params.input.username ? { username: params.input.username } : {}),
      ...(params.input.chatTitle ? { chatTitle: params.input.chatTitle } : {}),
    } as JsonObject,
  });
  if (!result.success) {
    throw new Error(result.error || "auth.authorize_incoming failed");
  }
  return readEvaluateResult(result.data);
}

export async function readAuthorizationSnapshotViaPlugin(
  runtime: ServiceRuntime,
): Promise<ChatAuthorizationSnapshot> {
  const result = await runtime.plugins.runAction({
    plugin: AUTH_PLUGIN_NAME,
    action: AUTH_ACTIONS.snapshot,
  });
  if (!result.success) {
    throw new Error(result.error || result.message || "auth snapshot failed");
  }
  return readSnapshot(result.data);
}

export async function readAuthorizationConfigViaPlugin(
  runtime: ServiceRuntime,
): Promise<ChatAuthorizationConfig> {
  const result = await runtime.plugins.runAction({
    plugin: AUTH_PLUGIN_NAME,
    action: AUTH_ACTIONS.readConfig,
  });
  if (!result.success) {
    throw new Error(result.error || result.message || "auth read-config failed");
  }
  return toRecord(result.data) as unknown as ChatAuthorizationConfig;
}

export async function writeAuthorizationConfigViaPlugin(params: {
  runtime: ServiceRuntime;
  config: ChatAuthorizationConfig;
}): Promise<ChatAuthorizationConfig> {
  const result = await params.runtime.plugins.runAction({
    plugin: AUTH_PLUGIN_NAME,
    action: AUTH_ACTIONS.writeConfig,
    payload: {
      config: params.config,
    } as AuthWriteConfigPayload as unknown as JsonObject,
  });
  if (!result.success) {
    throw new Error(result.error || result.message || "auth write-config failed");
  }
  return toRecord(result.data) as unknown as ChatAuthorizationConfig;
}

export async function setAuthorizationUserRoleViaPlugin(params: {
  runtime: ServiceRuntime;
  channel: ChatDispatchChannel;
  userId: string;
  roleId: string;
}): Promise<ChatAuthorizationConfig> {
  const result = await params.runtime.plugins.runAction({
    plugin: AUTH_PLUGIN_NAME,
    action: AUTH_ACTIONS.setUserRole,
    payload: {
      channel: params.channel,
      userId: params.userId,
      roleId: params.roleId,
    } as AuthSetUserRolePayload as unknown as JsonObject,
  });
  if (!result.success) {
    throw new Error(result.error || result.message || "auth set-user-role failed");
  }
  return toRecord(result.data) as unknown as ChatAuthorizationConfig;
}

export async function resolveAuthorizedUserRoleViaPlugin(params: {
  runtime: ServiceRuntime;
  channel: ChatDispatchChannel;
  userId?: string;
}): Promise<ChatAuthorizationRole | undefined> {
  const result = await params.runtime.capabilities.invoke({
    capability: AUTH_CAPABILITIES.resolveUserRole,
    payload: {
      channel: params.channel,
      ...(params.userId ? { userId: params.userId } : {}),
    },
  });
  if (!result.success) {
    throw new Error(result.error || "auth.resolve_user_role failed");
  }
  const role = toRecord(result.data);
  if (!role.roleId) return undefined;
  return role as unknown as ChatAuthorizationRole;
}
