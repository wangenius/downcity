/**
 * Auth 授权配置读写工具。
 *
 * 关键点（中文）
 * - 静态授权规则统一写入 console `~/.downcity/downcity.db`。
 * - 授权核心模型为 role / permission / binding。
 */

import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type {
  ChatAuthorizationConfig,
  ChatAuthorizationChannel,
  ChatAuthorizationPermission,
  ChatAuthorizationRole,
  ChatChannelAuthorizationConfig,
} from "@/types/AuthPlugin.js";
import {
  CHAT_AUTHORIZATION_CHANNELS,
  CHAT_AUTHORIZATION_PERMISSIONS,
  createDefaultChatAuthorizationRoles,
} from "@/types/AuthPlugin.js";
import { ConsoleStore } from "@/utils/store/index.js";

const CHAT_AUTHORIZATION_STORE_KEY = "chat_authorization";
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

function readAuthorizationConfigFromStoreSync(projectRoot: string): ChatAuthorizationConfig {
  const normalizedProjectRoot = normalizeText(projectRoot);
  if (!normalizedProjectRoot) return normalizeAuthorizationConfig({});
  const store = new ConsoleStore();
  try {
    return normalizeAuthorizationConfig(
      store.getAgentSecureSettingJsonSync<ChatAuthorizationConfig>(
        normalizedProjectRoot,
        CHAT_AUTHORIZATION_STORE_KEY,
      ) || {},
    );
  } catch {
    return normalizeAuthorizationConfig({});
  } finally {
    store.close();
  }
}

async function writeAuthorizationConfigToStore(params: {
  projectRoot: string;
  nextConfig: ChatAuthorizationConfig;
}): Promise<void> {
  const normalizedProjectRoot = normalizeText(params.projectRoot);
  if (!normalizedProjectRoot) throw new Error("projectRoot is required");
  const store = new ConsoleStore();
  try {
    await store.setAgentSecureSettingJson(
      normalizedProjectRoot,
      CHAT_AUTHORIZATION_STORE_KEY,
      normalizeAuthorizationConfig(params.nextConfig),
    );
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
 * 同步读取当前 agent 的授权配置。
 */
export function readChatAuthorizationConfigSync(projectRoot: string): ChatAuthorizationConfig {
  return readAuthorizationConfigFromStoreSync(projectRoot);
}

/**
 * 读取当前 agent 的授权配置。
 */
export function readChatAuthorizationConfig(
  contextOrProjectRoot: ServiceRuntime | string,
): ChatAuthorizationConfig {
  const projectRoot =
    typeof contextOrProjectRoot === "string"
      ? contextOrProjectRoot
      : contextOrProjectRoot.rootPath;
  return readAuthorizationConfigFromStoreSync(projectRoot);
}

/**
 * 覆盖写入整份授权配置。
 */
export async function writeChatAuthorizationConfig(params: {
  context: ServiceRuntime;
  nextConfig: ChatAuthorizationConfig;
}): Promise<void> {
  await writeAuthorizationConfigToStore({
    projectRoot: params.context.rootPath,
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
  context: ServiceRuntime;
  channel: ChatAuthorizationChannel;
  userId: string;
  roleId: string;
}): Promise<void> {
  const userId = normalizeText(params.userId);
  const roleId = normalizeText(params.roleId);
  if (!userId || !roleId) throw new Error("userId and roleId are required");
  const authorization = cloneAuthorizationConfig(
    readAuthorizationConfigFromStoreSync(params.context.rootPath),
  );
  authorization.roles = normalizeRoleMap(authorization.roles);
  const channelConfig = ensureChannelConfig(authorization, params.channel);
  if (!authorization.roles?.[roleId]) throw new Error(`Unknown roleId: ${roleId}`);
  channelConfig.userRoles ??= {};
  channelConfig.userRoles[userId] = roleId;
  await writeAuthorizationConfigToStore({
    projectRoot: params.context.rootPath,
    nextConfig: authorization,
  });
}
