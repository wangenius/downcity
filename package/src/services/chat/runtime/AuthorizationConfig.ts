/**
 * Chat 授权配置读写工具。
 *
 * 关键点（中文）
 * - 授权静态规则统一写入 console `~/.ship/ship.db`，不再写回项目 `ship.json`。
 * - agent 级配置通过 `agentId = projectRoot` 隔离，供 runtime 与 Console UI 共用。
 */

import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import { ConsoleStore } from "@/utils/store/index.js";
import type {
  ChatAuthorizationConfig,
  ChatChannelAuthorizationConfig,
} from "@services/chat/types/Authorization.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import { removeAuthorizationPairingRequest } from "@services/chat/runtime/AuthorizationStore.js";

const CHAT_AUTHORIZATION_STORE_KEY = "chat_authorization";

function normalizeText(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text ? text : undefined;
}

function normalizeStringList(values: string[] | undefined): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const normalized = [...new Set(values.map((value) => normalizeText(value)).filter(Boolean) as string[])];
  return normalized.length > 0 ? normalized : undefined;
}

function cloneAuthorizationConfig(
  input: ChatAuthorizationConfig | undefined,
): ChatAuthorizationConfig {
  if (!input || typeof input !== "object") return {};
  return JSON.parse(JSON.stringify(input)) as ChatAuthorizationConfig;
}

function ensureMutableAuthorizationConfig(config: ChatAuthorizationConfig): ChatAuthorizationConfig {
  config.channels ??= {};
  return config;
}

function ensureMutableChannelAuthorizationConfig(
  config: ChatAuthorizationConfig,
  channel: ChatDispatchChannel,
): ChatChannelAuthorizationConfig {
  config.channels ??= {};
  const current = config.channels[channel];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    config.channels[channel] = {};
  }
  return config.channels[channel] as ChatChannelAuthorizationConfig;
}

function readAuthorizationConfigFromStoreSync(projectRoot: string): ChatAuthorizationConfig {
  const normalizedProjectRoot = normalizeText(projectRoot);
  if (!normalizedProjectRoot) return {};
  const store = new ConsoleStore();
  try {
    return cloneAuthorizationConfig(
      store.getAgentSecureSettingJsonSync<ChatAuthorizationConfig>(
        normalizedProjectRoot,
        CHAT_AUTHORIZATION_STORE_KEY,
      ) || undefined,
    );
  } catch {
    return {};
  } finally {
    store.close();
  }
}

async function writeAuthorizationConfigToStore(params: {
  projectRoot: string;
  nextConfig: ChatAuthorizationConfig;
}): Promise<void> {
  const normalizedProjectRoot = normalizeText(params.projectRoot);
  if (!normalizedProjectRoot) {
    throw new Error("projectRoot is required");
  }
  const nextConfig = cloneAuthorizationConfig(params.nextConfig);
  const store = new ConsoleStore();
  try {
    await store.setAgentSecureSettingJson(
      normalizedProjectRoot,
      CHAT_AUTHORIZATION_STORE_KEY,
      nextConfig,
    );
  } finally {
    store.close();
  }
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
 * 允许指定用户访问当前渠道 DM。
 */
export async function grantChatAuthorizationUser(params: {
  context: ServiceRuntime;
  channel: ChatDispatchChannel;
  userId: string;
  asOwner?: boolean;
}): Promise<void> {
  const userId = normalizeText(params.userId);
  if (!userId) {
    throw new Error("userId is required");
  }

  const authorization = ensureMutableAuthorizationConfig(
    readAuthorizationConfigFromStoreSync(params.context.rootPath),
  );
  const channelConfig = ensureMutableChannelAuthorizationConfig(
    authorization,
    params.channel,
  );
  const nextAllowFrom = new Set(channelConfig.allowFrom || []);
  nextAllowFrom.add(userId);
  channelConfig.allowFrom = normalizeStringList([...nextAllowFrom]);

  if (params.asOwner === true) {
    const nextOwnerIds = new Set(channelConfig.ownerIds || []);
    nextOwnerIds.add(userId);
    channelConfig.ownerIds = normalizeStringList([...nextOwnerIds]);
  }

  await writeAuthorizationConfigToStore({
    projectRoot: params.context.rootPath,
    nextConfig: authorization,
  });
  await removeAuthorizationPairingRequest({
    context: params.context,
    channel: params.channel,
    userId,
  });
}

/**
 * 撤销指定用户 DM 授权。
 */
export async function revokeChatAuthorizationUser(params: {
  context: ServiceRuntime;
  channel: ChatDispatchChannel;
  userId: string;
}): Promise<void> {
  const userId = normalizeText(params.userId);
  if (!userId) return;

  const authorization = ensureMutableAuthorizationConfig(
    readAuthorizationConfigFromStoreSync(params.context.rootPath),
  );
  const channelConfig = ensureMutableChannelAuthorizationConfig(
    authorization,
    params.channel,
  );
  channelConfig.allowFrom = normalizeStringList(
    (channelConfig.allowFrom || []).filter((item) => item !== userId),
  );
  channelConfig.ownerIds = normalizeStringList(
    (channelConfig.ownerIds || []).filter((item) => item !== userId),
  );

  await writeAuthorizationConfigToStore({
    projectRoot: params.context.rootPath,
    nextConfig: authorization,
  });
}

/**
 * 切换指定用户的 owner 标记。
 */
export async function setChatAuthorizationOwner(params: {
  context: ServiceRuntime;
  channel: ChatDispatchChannel;
  userId: string;
  enabled: boolean;
}): Promise<void> {
  const userId = normalizeText(params.userId);
  if (!userId) {
    throw new Error("userId is required");
  }
  const authorization = ensureMutableAuthorizationConfig(
    readAuthorizationConfigFromStoreSync(params.context.rootPath),
  );
  const channelConfig = ensureMutableChannelAuthorizationConfig(
    authorization,
    params.channel,
  );
  const nextOwnerIds = new Set(channelConfig.ownerIds || []);
  if (params.enabled) {
    nextOwnerIds.add(userId);
    const nextAllowFrom = new Set(channelConfig.allowFrom || []);
    nextAllowFrom.add(userId);
    channelConfig.allowFrom = normalizeStringList([...nextAllowFrom]);
  } else {
    nextOwnerIds.delete(userId);
  }
  channelConfig.ownerIds = normalizeStringList([...nextOwnerIds]);

  await writeAuthorizationConfigToStore({
    projectRoot: params.context.rootPath,
    nextConfig: authorization,
  });
}

/**
 * 允许指定群 / 频道访问。
 */
export async function grantChatAuthorizationGroup(params: {
  context: ServiceRuntime;
  channel: ChatDispatchChannel;
  chatId: string;
}): Promise<void> {
  const chatId = normalizeText(params.chatId);
  if (!chatId) {
    throw new Error("chatId is required");
  }
  const authorization = ensureMutableAuthorizationConfig(
    readAuthorizationConfigFromStoreSync(params.context.rootPath),
  );
  const channelConfig = ensureMutableChannelAuthorizationConfig(
    authorization,
    params.channel,
  );
  const nextGroupAllowFrom = new Set(channelConfig.groupAllowFrom || []);
  nextGroupAllowFrom.add(chatId);
  channelConfig.groupAllowFrom = normalizeStringList([...nextGroupAllowFrom]);

  await writeAuthorizationConfigToStore({
    projectRoot: params.context.rootPath,
    nextConfig: authorization,
  });
}

/**
 * 撤销指定群 / 频道授权。
 */
export async function revokeChatAuthorizationGroup(params: {
  context: ServiceRuntime;
  channel: ChatDispatchChannel;
  chatId: string;
}): Promise<void> {
  const chatId = normalizeText(params.chatId);
  if (!chatId) return;
  const authorization = ensureMutableAuthorizationConfig(
    readAuthorizationConfigFromStoreSync(params.context.rootPath),
  );
  const channelConfig = ensureMutableChannelAuthorizationConfig(
    authorization,
    params.channel,
  );
  channelConfig.groupAllowFrom = normalizeStringList(
    (channelConfig.groupAllowFrom || []).filter((item) => item !== chatId),
  );

  await writeAuthorizationConfigToStore({
    projectRoot: params.context.rootPath,
    nextConfig: authorization,
  });
}
