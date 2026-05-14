/**
 * Auth 授权配置读写工具。
 *
 * 关键点（中文）
 * - 静态授权规则统一写入 city 全局 console `~/.downcity/downcity.db`。
 * - 授权核心模型为 role / permission / binding。
 * - chat authorization 不再按 agent/projectRoot 隔离；agent 只负责连接 channel account。
 */

import type { AgentContext } from "@/types/agent/AgentContext.js";
import type {
  ChatAuthorizationConfig,
  ChatAuthorizationChannel,
  ChatAuthorizationPermission,
  ChatAuthorizationRole,
  ChatChannelAuthorizationConfig,
} from "@/shared/types/AuthPlugin.js";
import type {
  StoredChatAuthChannelDefault,
  StoredChatAuthRole,
  StoredChatAuthRolePermission,
  StoredChatAuthSnapshot,
  StoredChatAuthUserRole,
} from "@/shared/types/Store.js";
import {
  CHAT_AUTHORIZATION_CHANNELS,
  CHAT_AUTHORIZATION_PERMISSIONS,
  createDefaultChatAuthorizationRoles,
} from "@/shared/types/AuthPlugin.js";
import { ConsoleStore } from "@/shared/utils/store/index.js";

const CHANNELS: ChatAuthorizationChannel[] = [...CHAT_AUTHORIZATION_CHANNELS];

export const DEFAULT_CHAT_AUTHORIZATION_PERMISSIONS: ChatAuthorizationPermission[] = [
  ...CHAT_AUTHORIZATION_PERMISSIONS,
];

function normalizeText(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text ? text : undefined;
}

function normalizePermissionList(values: unknown[] | undefined): ChatAuthorizationPermission[] {
  const allowed = new Set<string>(DEFAULT_CHAT_AUTHORIZATION_PERMISSIONS);
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) => normalizeText(value))
        .filter(
          (value): value is ChatAuthorizationPermission =>
            Boolean(value && allowed.has(value)),
        ),
    ),
  ];
}

function buildDefaultRole(roleId: "default" | "member" | "admin"): ChatAuthorizationRole {
  return createDefaultChatAuthorizationRoles()[roleId];
}

function normalizeRoleMap(input: unknown): Record<string, ChatAuthorizationRole> {
  const defaultRoles = createDefaultChatAuthorizationRoles();
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaultRoles;
  const roles: Record<string, ChatAuthorizationRole> = {};
  for (const [rawRoleId, rawRole] of Object.entries(input)) {
    const roleId = normalizeText(rawRoleId);
    if (!roleId) continue;
    const roleObj =
      rawRole && typeof rawRole === "object" && !Array.isArray(rawRole)
        ? (rawRole as {
            name?: unknown;
            description?: unknown;
            permissions?: unknown[];
            roleId?: unknown;
          })
        : null;
    if (!roleObj) continue;
    const builtinRole = defaultRoles[roleId];
    roles[roleId] = {
      roleId,
      name: normalizeText(roleObj.name) || builtinRole?.name || roleId,
      ...(normalizeText(roleObj.description) || builtinRole?.description
        ? {
            description:
              normalizeText(roleObj.description) || builtinRole?.description || undefined,
          }
        : {}),
      permissions: normalizePermissionList(roleObj.permissions),
    };
  }
  if (Object.keys(roles).length === 0) return defaultRoles;
  if (!roles.default) roles.default = buildDefaultRole("default");
  return roles;
}

function normalizeBindingMap(
  input: unknown,
  roles: Record<string, ChatAuthorizationRole>,
): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [rawId, rawRoleId] of Object.entries(input)) {
    const entityId = normalizeText(rawId);
    const roleId = normalizeText(rawRoleId);
    if (!entityId || !roleId || !roles[roleId]) continue;
    out[entityId] = roleId;
  }
  return out;
}

function normalizeChannelConfig(
  input: unknown,
  roles: Record<string, ChatAuthorizationRole>,
): ChatChannelAuthorizationConfig {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as {
          defaultUserRoleId?: unknown;
          userRoles?: unknown;
        })
      : {};
  const defaultUserRoleId = normalizeText(raw.defaultUserRoleId) || "default";
  return {
    defaultUserRoleId: roles[defaultUserRoleId] ? defaultUserRoleId : "default",
    userRoles: normalizeBindingMap(raw.userRoles, roles),
  };
}

function normalizeAuthorizationConfig(input: unknown): ChatAuthorizationConfig {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as { roles?: unknown; channels?: Record<string, unknown> })
      : {};
  const roles = normalizeRoleMap(raw.roles);
  const channels: Partial<Record<ChatAuthorizationChannel, ChatChannelAuthorizationConfig>> = {};
  for (const channel of CHANNELS) {
    channels[channel] = normalizeChannelConfig(raw.channels?.[channel], roles);
  }
  return { roles, channels };
}

function cloneAuthorizationConfig(
  input: ChatAuthorizationConfig | undefined,
): ChatAuthorizationConfig {
  return normalizeAuthorizationConfig(input ? JSON.parse(JSON.stringify(input)) : {});
}

function snapshotIsEmpty(snapshot: StoredChatAuthSnapshot): boolean {
  return (
    snapshot.roles.length === 0 &&
    snapshot.rolePermissions.length === 0 &&
    snapshot.channelDefaults.length === 0 &&
    snapshot.userRoles.length === 0
  );
}

function configToSnapshot(input: ChatAuthorizationConfig): StoredChatAuthSnapshot {
  const config = normalizeAuthorizationConfig(input);
  const now = new Date().toISOString();
  const roles: StoredChatAuthRole[] = Object.values(config.roles || {}).map((role) => ({
    roleId: role.roleId,
    name: role.name,
    description: role.description,
    createdAt: now,
    updatedAt: now,
  }));
  const rolePermissions: StoredChatAuthRolePermission[] = [];
  for (const role of Object.values(config.roles || {})) {
    for (const permission of role.permissions || []) {
      rolePermissions.push({
        roleId: role.roleId,
        permission,
        createdAt: now,
      });
    }
  }
  const channelDefaults: StoredChatAuthChannelDefault[] = [];
  const userRoles: StoredChatAuthUserRole[] = [];
  for (const channel of CHANNELS) {
    const channelConfig = config.channels?.[channel];
    channelDefaults.push({
      channel,
      roleId: channelConfig?.defaultUserRoleId || "default",
      createdAt: now,
      updatedAt: now,
    });
    for (const [userId, roleId] of Object.entries(channelConfig?.userRoles || {})) {
      userRoles.push({
        channel,
        userId,
        roleId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return { roles, rolePermissions, channelDefaults, userRoles };
}

function snapshotToConfig(snapshot: StoredChatAuthSnapshot): ChatAuthorizationConfig {
  const roles: Record<string, ChatAuthorizationRole> = {};
  for (const role of snapshot.roles) {
    roles[role.roleId] = {
      roleId: role.roleId,
      name: role.name,
      description: role.description,
      permissions: [],
    };
  }
  for (const item of snapshot.rolePermissions) {
    const role = roles[item.roleId];
    if (!role) continue;
    role.permissions.push(item.permission as ChatAuthorizationPermission);
  }
  const config = normalizeAuthorizationConfig({
    roles,
    channels: {},
  });
  for (const item of snapshot.channelDefaults) {
    const channelConfig = ensureChannelConfig(config, item.channel);
    channelConfig.defaultUserRoleId = item.roleId;
  }
  for (const item of snapshot.userRoles) {
    const channelConfig = ensureChannelConfig(config, item.channel);
    channelConfig.userRoles ??= {};
    channelConfig.userRoles[item.userId] = item.roleId;
  }
  return normalizeAuthorizationConfig(config);
}

function readAuthorizationConfigFromStoreSync(): ChatAuthorizationConfig {
  const store = new ConsoleStore();
  try {
    const snapshot = store.getChatAuthSnapshot();
    if (!snapshotIsEmpty(snapshot)) {
      return snapshotToConfig(snapshot);
    }

    const defaults = normalizeAuthorizationConfig({});
    store.replaceChatAuthSnapshot(configToSnapshot(defaults));
    return defaults;
  } catch {
    return normalizeAuthorizationConfig({});
  } finally {
    store.close();
  }
}

async function writeAuthorizationConfigToStore(params: {
  nextConfig: ChatAuthorizationConfig;
}): Promise<void> {
  const store = new ConsoleStore();
  try {
    store.replaceChatAuthSnapshot(configToSnapshot(params.nextConfig));
  } finally {
    store.close();
  }
}

function ensureChannelConfig(
  config: ChatAuthorizationConfig,
  channel: ChatAuthorizationChannel,
): ChatChannelAuthorizationConfig {
  config.roles = normalizeRoleMap(config.roles);
  config.channels ??= {};
  config.channels[channel] = normalizeChannelConfig(config.channels[channel], config.roles);
  return config.channels[channel] as ChatChannelAuthorizationConfig;
}

/**
 * 同步读取 city 全局授权配置。
 */
export function readChatAuthorizationConfigSync(_projectRoot?: string): ChatAuthorizationConfig {
  return readAuthorizationConfigFromStoreSync();
}

/**
 * 读取 city 全局授权配置。
 */
export function readChatAuthorizationConfig(
  _contextOrProjectRoot?: Pick<AgentContext, "rootPath"> | string,
): ChatAuthorizationConfig {
  return readAuthorizationConfigFromStoreSync();
}

/**
 * 覆盖写入整份授权配置。
 */
export async function writeChatAuthorizationConfig(params: {
  context?: Pick<AgentContext, "rootPath">;
  nextConfig: ChatAuthorizationConfig;
}): Promise<void> {
  await writeAuthorizationConfigToStore({
    nextConfig: params.nextConfig,
  });
}

/**
 * 读取角色列表。
 */
export function listChatAuthorizationRoles(params: {
  config: ChatAuthorizationConfig;
}): ChatAuthorizationRole[] {
  const config = normalizeAuthorizationConfig(params.config);
  return Object.values(config.roles || {}).sort((a, b) => a.roleId.localeCompare(b.roleId));
}

/**
 * 设置用户角色。
 */
export async function setChatAuthorizationUserRole(params: {
  context?: Pick<AgentContext, "rootPath">;
  channel: ChatAuthorizationChannel;
  userId: string;
  roleId: string;
}): Promise<void> {
  const userId = normalizeText(params.userId);
  const roleId = normalizeText(params.roleId);
  if (!userId || !roleId) throw new Error("userId and roleId are required");
  const authorization = cloneAuthorizationConfig(
    readAuthorizationConfigFromStoreSync(),
  );
  authorization.roles = normalizeRoleMap(authorization.roles);
  if (!authorization.roles?.[roleId]) throw new Error(`Unknown roleId: ${roleId}`);
  const store = new ConsoleStore();
  try {
    store.setChatAuthUserRole({
      channel: params.channel,
      userId,
      roleId,
    });
  } finally {
    store.close();
  }
}
