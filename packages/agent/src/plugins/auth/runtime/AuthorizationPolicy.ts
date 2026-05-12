/**
 * Auth 授权判定逻辑。
 *
 * 关键点（中文）
 * - 角色模型替代旧的 allowlist/pairing 模型。
 * - 判定统一走“用户角色 + 权限集合”，群聊只看发言用户自身权限。
 */

import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type {
  ChatAuthorizationConfig,
  ChatAuthorizationChannel,
  ChatAuthorizationEvaluateInput,
  ChatAuthorizationEvaluateResult,
  ChatAuthorizationPermission,
  ChatAuthorizationRole,
  ChatChannelAuthorizationConfig,
} from "@/shared/types/AuthPlugin.js";
import { createDefaultChatAuthorizationRoles } from "@/shared/types/AuthPlugin.js";
import { readChatAuthorizationConfigSync } from "@/plugins/auth/runtime/AuthorizationConfig.js";

function normalizeText(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text ? text : undefined;
}

function isDirectMessage(channel: ChatAuthorizationChannel, chatType?: string): boolean {
  const type = String(chatType || "").trim().toLowerCase();
  if (!type) return true;
  if (channel === "telegram") return type === "private";
  if (channel === "feishu") return type === "p2p";
  if (channel === "qq") return type === "private" || type === "c2c";
  return false;
}

function resolveAuthorizationRoles(
  authorizationConfig?: ChatAuthorizationConfig,
): Record<string, ChatAuthorizationRole> {
  const raw = authorizationConfig?.roles;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createDefaultChatAuthorizationRoles();
  }
  return Object.keys(raw).length > 0 ? raw : createDefaultChatAuthorizationRoles();
}

function resolveChannelAuthorizationConfig(
  channel: ChatAuthorizationChannel,
  authorizationConfig?: ChatAuthorizationConfig,
): ChatChannelAuthorizationConfig {
  const raw = authorizationConfig?.channels?.[channel];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      defaultUserRoleId: "default",
      userRoles: {},
    };
  }
  return raw;
}

function resolveRole(
  roleId: string | undefined,
  roles: Record<string, ChatAuthorizationRole> | undefined,
): ChatAuthorizationRole {
  if (roleId && roles?.[roleId]) return roles[roleId];
  if (roles?.default) return roles.default;
  return { roleId: "default", name: "Default", permissions: [] };
}

function hasPermission(
  role: ChatAuthorizationRole,
  permission: ChatAuthorizationPermission,
): boolean {
  return role.permissions.includes(permission);
}

function resolveUserRole(params: {
  roles: Record<string, ChatAuthorizationRole>;
  channelConfig: ChatChannelAuthorizationConfig;
  userId?: string;
}): ChatAuthorizationRole {
  const userId = normalizeText(params.userId);
  const defaultRoleId = normalizeText(params.channelConfig.defaultUserRoleId) || "default";
  const boundRoleId = userId ? normalizeText(params.channelConfig.userRoles?.[userId]) : undefined;
  return resolveRole(boundRoleId || defaultRoleId, params.roles);
}

/**
 * 解析用户授权角色。
 */
export function resolveAuthorizedUserRole(params: {
  channel: ChatAuthorizationChannel;
  userId?: string;
  authorizationConfig?: ChatAuthorizationConfig;
  rootPath?: string;
}): ChatAuthorizationRole | undefined {
  const userId = normalizeText(params.userId);
  if (!userId) return undefined;
  const authorizationConfig =
    params.authorizationConfig ||
    (params.rootPath ? readChatAuthorizationConfigSync(params.rootPath) : undefined);
  const roles = resolveAuthorizationRoles(authorizationConfig);
  const channelConfig = resolveChannelAuthorizationConfig(params.channel, authorizationConfig);
  return resolveUserRole({
    roles,
    channelConfig,
    userId,
  });
}

/**
 * 执行入站授权判定。
 */
export function evaluateIncomingChatAuthorization(params: {
  config: DowncityConfig;
  channel: ChatAuthorizationChannel;
  input: ChatAuthorizationEvaluateInput;
  authorizationConfig?: ChatAuthorizationConfig;
}): ChatAuthorizationEvaluateResult {
  const channelConfig = resolveChannelAuthorizationConfig(
    params.channel,
    params.authorizationConfig,
  );
  const roles = resolveAuthorizationRoles(params.authorizationConfig);
  const direct = isDirectMessage(params.channel, params.input.chatType);
  const userRole = resolveUserRole({
    roles,
    channelConfig,
    userId: params.input.userId,
  });
  const isOwner = hasPermission(userRole, "agent.manage");

  if (direct) {
    return hasPermission(userRole, "chat.dm.use")
      ? {
          decision: "allow",
          isOwner,
          userRoleId: userRole.roleId,
          userPermissions: [...userRole.permissions],
          reason: "dm_role_allowed",
        }
      : {
          decision: "block",
          isOwner,
          userRoleId: userRole.roleId,
          userPermissions: [...userRole.permissions],
          reason: "dm_role_blocked",
        };
  }

  return hasPermission(userRole, "chat.group.use")
    ? {
        decision: "allow",
        isOwner,
        userRoleId: userRole.roleId,
        userPermissions: [...userRole.permissions],
        reason: "group_user_role_allowed",
      }
    : {
        decision: "block",
        isOwner,
        userRoleId: userRole.roleId,
        userPermissions: [...userRole.permissions],
        reason: "user_group_permission_blocked",
      };
}
