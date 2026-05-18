/**
 * City 级 chat authorization 配置存储。
 *
 * 关键点（中文）
 * - 静态 chat 授权配置属于 city 维护的项目侧状态。
 * - 这里把配置落在项目 `.downcity/chat/authorization/config.json`。
 * - agent 只消费注入进来的读写能力，不再自己管理这份配置。
 */

import fs from "fs-extra";
import path from "node:path";
import type {
  ChatAuthorizationChannel,
  ChatAuthorizationConfig,
  ChatAuthorizationRole,
  ChatChannelAuthorizationConfig,
} from "@downcity/agent";
import {
  CHAT_AUTHORIZATION_CHANNELS,
  createDefaultChatAuthorizationRoles,
} from "@downcity/agent";

function normalizeText(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text || undefined;
}

function normalizeRoleMap(input: unknown): Record<string, ChatAuthorizationRole> {
  const defaultRoles = createDefaultChatAuthorizationRoles();
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaultRoles;
  const roles: Record<string, ChatAuthorizationRole> = {};
  for (const [rawRoleId, rawRole] of Object.entries(input as Record<string, unknown>)) {
    const roleId = normalizeText(rawRoleId);
    if (!roleId) continue;
    const roleObj =
      rawRole && typeof rawRole === "object" && !Array.isArray(rawRole)
        ? (rawRole as {
            name?: unknown;
            description?: unknown;
            permissions?: unknown[];
          })
        : null;
    if (!roleObj) continue;
    const builtinRole = defaultRoles[roleId];
    const permissions = Array.isArray(roleObj.permissions)
      ? [...new Set(roleObj.permissions.map((item) => normalizeText(item)).filter(Boolean))]
      : [];
    roles[roleId] = {
      roleId,
      name: normalizeText(roleObj.name) || builtinRole?.name || roleId,
      ...(normalizeText(roleObj.description) || builtinRole?.description
        ? {
            description:
              normalizeText(roleObj.description) || builtinRole?.description || undefined,
          }
        : {}),
      permissions: permissions as ChatAuthorizationRole["permissions"],
    };
  }
  if (Object.keys(roles).length === 0) return defaultRoles;
  if (!roles.default) roles.default = defaultRoles.default;
  return roles;
}

function normalizeBindingMap(
  input: unknown,
  roles: Record<string, ChatAuthorizationRole>,
): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [rawId, rawRoleId] of Object.entries(input as Record<string, unknown>)) {
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
  for (const channel of CHAT_AUTHORIZATION_CHANNELS) {
    channels[channel] = normalizeChannelConfig(raw.channels?.[channel], roles);
  }
  return { roles, channels };
}

function getChatAuthorizationConfigPath(projectRoot: string): string {
  return path.join(projectRoot, ".downcity", "chat", "authorization", "config.json");
}

function readConfigFile(projectRoot: string): ChatAuthorizationConfig {
  const file = getChatAuthorizationConfigPath(projectRoot);
  if (!fs.existsSync(file)) return normalizeAuthorizationConfig({});
  try {
    return normalizeAuthorizationConfig(fs.readJsonSync(file));
  } catch {
    return normalizeAuthorizationConfig({});
  }
}

function writeConfigFile(projectRoot: string, config: ChatAuthorizationConfig): ChatAuthorizationConfig {
  const file = getChatAuthorizationConfigPath(projectRoot);
  fs.ensureDirSync(path.dirname(file));
  fs.writeJsonSync(file, normalizeAuthorizationConfig(config), { spaces: 2 });
  return normalizeAuthorizationConfig(config);
}

/**
 * 同步读取 chat authorization 配置。
 */
export function readChatAuthorizationConfigSync(projectRoot: string): ChatAuthorizationConfig {
  return readConfigFile(String(projectRoot || "").trim());
}

/**
 * 读取 chat authorization 配置。
 */
export async function readChatAuthorizationConfig(
  projectRoot: string,
): Promise<ChatAuthorizationConfig> {
  return readChatAuthorizationConfigSync(projectRoot);
}

/**
 * 覆盖写入 chat authorization 配置。
 */
export async function writeChatAuthorizationConfig(
  projectRoot: string,
  nextConfig: ChatAuthorizationConfig,
): Promise<ChatAuthorizationConfig> {
  return writeConfigFile(String(projectRoot || "").trim(), nextConfig);
}

/**
 * 设置单个用户角色。
 */
export async function setChatAuthorizationUserRole(params: {
  projectRoot: string;
  channel: ChatAuthorizationChannel;
  userId: string;
  roleId: string;
}): Promise<ChatAuthorizationConfig> {
  const projectRoot = String(params.projectRoot || "").trim();
  const userId = normalizeText(params.userId);
  const roleId = normalizeText(params.roleId);
  if (!projectRoot) throw new Error("projectRoot is required");
  if (!userId || !roleId) throw new Error("userId and roleId are required");
  const next = readConfigFile(projectRoot);
  next.roles = normalizeRoleMap(next.roles);
  if (!next.roles[roleId]) throw new Error(`Unknown roleId: ${roleId}`);
  next.channels ??= {};
  const channelConfig = normalizeChannelConfig(next.channels[params.channel], next.roles);
  channelConfig.userRoles ??= {};
  channelConfig.userRoles[userId] = roleId;
  next.channels[params.channel] = channelConfig;
  return writeConfigFile(projectRoot, next);
}
