/**
 * AgentHostRuntime：装配 AgentRuntime 宿主能力。
 *
 * 关键点（中文）
 * - `main/agent/*` 负责创建这些宿主能力对象，再注入到 AgentRuntime。
 * - services / session / plugins 只消费这些对象，不再直接 import `main/*`。
 * - 当前由 city 在这里统一装配路径、plugin 配置持久化与平台能力三类宿主对象。
 */
import {
  getCacheDirPath,
  getDowncityChannelDirPath,
  getDowncityChannelMetaPath,
  getDowncityChatHistoryPath,
  getDowncityDirPath,
  getDowncityMemoryDailyDirPath,
  getDowncityMemoryDailyPath,
  getDowncityMemoryLongTermPath,
  getDowncitySessionDirPath,
  getDowncitySessionRootDirPath,
} from "@/config/Paths.js";
import { persistProjectPluginConfig } from "@downcity/agent";
import type {
  AgentPathRuntime,
  AgentPlatformRuntime,
  AgentPluginConfigRuntime,
  ChatChannelAccountListItem,
  StoredChannelAccount,
  StoredChannelAccountChannel,
} from "@downcity/agent";
import type { DowncityConfig } from "@downcity/agent";
import { PlatformStore } from "@/platform/store/index.js";
import {
  isCityPluginEnabled,
  setCityPluginEnabled,
} from "@/platform/PluginLifecycle.js";
import {
  readChatAuthorizationConfigSync,
  setChatAuthorizationUserRole,
  writeChatAuthorizationConfig,
} from "@/platform/chatAuthorization/Store.js";

/**
 * 脱敏显示密钥。
 *
 * 关键点（中文）
 * - channel account 列表只返回安全视图，避免在 CLI/UI 展示链路泄露明文。
 * - 保持和现有 model provider 脱敏规则一致，减少用户心智负担。
 */
function maskSecret(value: string | undefined): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

/**
 * 将存储层 channel account 转成对外安全视图。
 */
function toChannelAccountListItem(
  account: StoredChannelAccount,
): ChatChannelAccountListItem {
  return {
    id: account.id,
    channel: account.channel,
    name: account.name,
    identity: account.identity,
    owner: account.owner,
    creator: account.creator,
    domain: account.domain,
    sandbox: account.sandbox === true,
    hasBotToken: !!String(account.botToken || "").trim(),
    hasAppId: !!String(account.appId || "").trim(),
    hasAppSecret: !!String(account.appSecret || "").trim(),
    botTokenMasked: maskSecret(account.botToken),
    appIdMasked: maskSecret(account.appId),
    appSecretMasked: maskSecret(account.appSecret),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/**
 * 归一化并校验 channel account 渠道名。
 */
function normalizeChannelAccountChannel(
  channelInput: string,
): StoredChannelAccountChannel {
  const channel = String(channelInput || "").trim().toLowerCase();
  if (channel === "telegram" || channel === "feishu" || channel === "qq") {
    return channel;
  }
  throw new Error(`Unsupported channel account channel: ${channelInput}`);
}

/**
 * 创建当前项目的路径能力集合。
 */
export function createAgentPathRuntime(
  projectRoot: string,
  agentIdInput: string,
): AgentPathRuntime {
  const rootPath = String(projectRoot || "").trim();
  const agentId = String(agentIdInput || "").trim();
  return {
    projectRoot: rootPath,
    agentId,
    getDowncityDirPath: () => getDowncityDirPath(rootPath),
    getCacheDirPath: () => getCacheDirPath(rootPath),
    getDowncityChannelDirPath: () => getDowncityChannelDirPath(rootPath),
    getDowncityChannelMetaPath: () => getDowncityChannelMetaPath(rootPath),
    getDowncityChatHistoryPath: (sessionId) => getDowncityChatHistoryPath(rootPath, sessionId),
    getDowncityMemoryLongTermPath: () => getDowncityMemoryLongTermPath(rootPath),
    getDowncityMemoryDailyDirPath: () => getDowncityMemoryDailyDirPath(rootPath),
    getDowncityMemoryDailyPath: (date) => getDowncityMemoryDailyPath(rootPath, date),
    getDowncitySessionRootDirPath: () => getDowncitySessionRootDirPath(rootPath, agentId),
    getDowncitySessionDirPath: (sessionId) =>
      getDowncitySessionDirPath(rootPath, agentId, sessionId),
  } as AgentPathRuntime;
}

/**
 * 创建 plugin 配置持久化能力集合。
 */
export function createAgentPluginConfigRuntime(projectRoot: string): AgentPluginConfigRuntime {
  const rootPath = String(projectRoot || "").trim();
  return {
    async persistProjectPlugins(plugins: DowncityConfig["plugins"] | undefined): Promise<string> {
      return persistProjectPluginConfig({
        projectRoot: rootPath,
        sections: {
          ...(plugins !== undefined ? { plugins } : {}),
        },
      });
    },
  };
}

/**
 * 创建当前项目的平台能力集合。
 *
 * 关键点（中文）
 * - 这里先暴露 agent 当前已经需要的最小平台读能力。
 * - 具体平台数据仍由 city 自己管理，agent 只消费这一层接口。
 */
export function createAgentPlatformRuntime(): AgentPlatformRuntime {
  return {
    getGlobalEnv: () => {
      const store = new PlatformStore();
      try {
        return store.getGlobalEnvMapSync();
      } finally {
        store.close();
      }
    },
    getAgentEnv: (projectRoot) => {
      const store = new PlatformStore();
      try {
        return store.getAgentEnvMapSync(projectRoot);
      } finally {
        store.close();
      }
    },
    listModels: () => {
      const store = new PlatformStore();
      try {
        return store.listModels();
      } finally {
        store.close();
      }
    },
    listProviders: async () => {
      const store = new PlatformStore();
      try {
        return await store.listProviders();
      } finally {
        store.close();
      }
    },
    getModel: (modelId) => {
      const store = new PlatformStore();
      try {
        return store.getModel(modelId);
      } finally {
        store.close();
      }
    },
    getChannelAccount: (channelAccountId) => {
      const store = new PlatformStore();
      try {
        return store.getChannelAccountSync(channelAccountId);
      } finally {
        store.close();
      }
    },
    listChannelAccounts: async () => {
      const store = new PlatformStore();
      try {
        const accounts = await store.listChannelAccounts();
        return accounts.map(toChannelAccountListItem);
      } finally {
        store.close();
      }
    },
    updateChannelAccount: async (input) => {
      const store = new PlatformStore();
      try {
        await store.upsertChannelAccount({
          ...input,
          channel: normalizeChannelAccountChannel(input.channel),
        });
      } finally {
        store.close();
      }
    },
    removeChannelAccount: async (channelAccountId) => {
      const store = new PlatformStore();
      try {
        store.removeChannelAccount(channelAccountId);
      } finally {
        store.close();
      }
    },
    readChatAuthorizationConfig: (projectRoot) => readChatAuthorizationConfigSync(projectRoot),
    writeChatAuthorizationConfig,
    setChatAuthorizationUserRole,
    isPluginEnabled: (pluginName) => isCityPluginEnabled(pluginName),
    setPluginEnabled: (pluginName, enabled) => {
      setCityPluginEnabled(pluginName, enabled);
    },
  };
}
