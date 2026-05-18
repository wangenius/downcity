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
 * 创建当前项目的路径能力集合。
 */
export function createAgentPathRuntime(projectRoot: string): AgentPathRuntime {
  const rootPath = String(projectRoot || "").trim();
  return {
    projectRoot: rootPath,
    getDowncityDirPath: () => getDowncityDirPath(rootPath),
    getCacheDirPath: () => getCacheDirPath(rootPath),
    getDowncityChannelDirPath: () => getDowncityChannelDirPath(rootPath),
    getDowncityChannelMetaPath: () => getDowncityChannelMetaPath(rootPath),
    getDowncityChatHistoryPath: (sessionId) => getDowncityChatHistoryPath(rootPath, sessionId),
    getDowncityMemoryLongTermPath: () => getDowncityMemoryLongTermPath(rootPath),
    getDowncityMemoryDailyDirPath: () => getDowncityMemoryDailyDirPath(rootPath),
    getDowncityMemoryDailyPath: (date) => getDowncityMemoryDailyPath(rootPath, date),
    getDowncitySessionRootDirPath: () => getDowncitySessionRootDirPath(rootPath),
    getDowncitySessionDirPath: (sessionId) => getDowncitySessionDirPath(rootPath, sessionId),
  };
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
    readChatAuthorizationConfig: (projectRoot) => readChatAuthorizationConfigSync(projectRoot),
    writeChatAuthorizationConfig,
    setChatAuthorizationUserRole,
    isPluginEnabled: (pluginName) => isCityPluginEnabled(pluginName),
    setPluginEnabled: (pluginName, enabled) => {
      setCityPluginEnabled(pluginName, enabled);
    },
  };
}
