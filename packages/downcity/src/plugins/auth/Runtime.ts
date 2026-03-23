/**
 * Auth Plugin Runtime Helper。
 *
 * 关键点（中文）
 * - 这里专注 auth plugin 的管理面 action API。
 * - chat 主链路已经转到 services/chat/runtime 下的 plugin helper。
 */

import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type { JsonObject } from "@/types/Json.js";
import {
  AUTH_PLUGIN_NAME,
  AUTH_ACTIONS,
  ChatAuthorizationConfig,
  ChatAuthorizationSnapshot,
  type AuthSetUserRolePayload,
  type AuthWriteConfigPayload,
} from "@/types/AuthPlugin.js";

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readSnapshot(value: unknown): ChatAuthorizationSnapshot {
  const record = toRecord(value);
  return {
    config: (toRecord(record.config) as unknown) as ChatAuthorizationConfig,
    users: (Array.isArray(record.users) ? record.users : []) as ChatAuthorizationSnapshot["users"],
    chats: (Array.isArray(record.chats) ? record.chats : []) as ChatAuthorizationSnapshot["chats"],
  };
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
  channel: string;
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
