/**
 * Control Authorization Service。
 *
 * 关键点（中文）
 * - 这是 control 侧的 auth 管理面 facade。
 * - 它通过 auth plugin action 读取与写入授权数据，但自身不属于 plugin 内核。
 * - 这样调用方不需要知道 plugin action 名称，也不需要依赖 `plugin/builtins/auth/*` 目录。
 */

import type { AgentContext } from "@/core/AgentContextTypes.js";
import type { JsonObject } from "@/types/common/Json.js";
import type { AuthControlPayload } from "@/runtime/server/http/control/types/AuthControl.js";
import type {
  AuthSetUserRolePayload,
  AuthWriteConfigPayload,
  ChatAuthorizationConfig,
  ChatAuthorizationSnapshot,
} from "@/plugin/builtins/auth/types/AuthPlugin.js";
import {
  AUTH_ACTIONS,
  AUTH_PLUGIN_NAME,
  CHAT_AUTHORIZATION_CATALOG,
} from "@/plugin/builtins/auth/types/AuthPlugin.js";

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readSnapshot(value: unknown): ChatAuthorizationSnapshot {
  const record = toRecord(value);
  return {
    config: toRecord(record.config) as unknown as ChatAuthorizationConfig,
    users: (Array.isArray(record.users) ? record.users : []) as ChatAuthorizationSnapshot["users"],
    chats: (Array.isArray(record.chats) ? record.chats : []) as ChatAuthorizationSnapshot["chats"],
  };
}

/**
 * 读取 auth plugin 快照。
 */
async function readAuthorizationSnapshotViaPlugin(
  context: AgentContext,
): Promise<ChatAuthorizationSnapshot> {
  const result = await context.plugins.runAction({
    plugin: AUTH_PLUGIN_NAME,
    action: AUTH_ACTIONS.snapshot,
  });
  if (!result.success) {
    throw new Error(result.error || result.message || "auth snapshot failed");
  }
  return readSnapshot(result.data);
}

/**
 * 读取 auth plugin 配置。
 */
async function readAuthorizationConfigViaPlugin(
  context: AgentContext,
): Promise<ChatAuthorizationConfig> {
  const result = await context.plugins.runAction({
    plugin: AUTH_PLUGIN_NAME,
    action: AUTH_ACTIONS.readConfig,
  });
  if (!result.success) {
    throw new Error(result.error || result.message || "auth read-config failed");
  }
  return toRecord(result.data) as unknown as ChatAuthorizationConfig;
}

/**
 * 通过 auth plugin 覆盖写入授权配置。
 */
async function writeAuthorizationConfigViaPlugin(params: {
  context: AgentContext;
  config: ChatAuthorizationConfig;
}): Promise<ChatAuthorizationConfig> {
  const result = await params.context.plugins.runAction({
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

/**
 * 通过 auth plugin 设置用户角色。
 */
async function setAuthorizationUserRoleViaPlugin(params: {
  context: AgentContext;
  channel: string;
  userId: string;
  roleId: string;
}): Promise<ChatAuthorizationConfig> {
  const result = await params.context.plugins.runAction({
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

/**
 * 读取 authorization 页面所需的完整数据。
 */
export async function readAuthControlPayload(
  context: AgentContext,
): Promise<AuthControlPayload> {
  const [config, snapshot] = await Promise.all([
    readAuthorizationConfigViaPlugin(context),
    readAuthorizationSnapshotViaPlugin(context),
  ]);
  return {
    catalog: CHAT_AUTHORIZATION_CATALOG,
    config,
    users: snapshot.users,
    chats: snapshot.chats,
  };
}

/**
 * 覆盖写入授权配置，并返回最新 control payload。
 */
export async function writeAuthControlConfig(params: {
  context: AgentContext;
  config: ChatAuthorizationConfig;
}): Promise<AuthControlPayload> {
  await writeAuthorizationConfigViaPlugin({
    context: params.context,
    config: params.config,
  });
  return readAuthControlPayload(params.context);
}

/**
 * 设置用户角色，并返回最新 control payload。
 */
export async function setAuthControlUserRole(params: {
  context: AgentContext;
  input: AuthSetUserRolePayload;
}): Promise<AuthControlPayload> {
  await setAuthorizationUserRoleViaPlugin({
    context: params.context,
    channel: params.input.channel,
    userId: params.input.userId,
    roleId: params.input.roleId,
  });
  return readAuthControlPayload(params.context);
}
