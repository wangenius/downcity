/**
 * AgentHostRuntime：装配 AgentRuntime 宿主能力。
 *
 * 关键点（中文）
 * - `main/agent/*` 负责创建这些宿主能力对象，再注入到 AgentRuntime。
 * - plugin runtimes / session / plugins 只消费这些对象，不再直接 import `main/*`。
 * - 当前由 city 在这里统一装配路径、plugin 配置持久化与模型目录三类宿主对象。
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
  AgentModelCatalogRuntime,
  AgentPluginConfigRuntime,
} from "@downcity/agent";
import type { DowncityConfig } from "@downcity/agent";
import { PlatformStore } from "@/platform/store/index.js";

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
 * 创建当前项目的模型目录能力集合。
 *
 * 关键点（中文）
 * - 这里只暴露 agent 当前仍需要的最小模型池只读能力。
 * - 具体平台数据仍由 city 自己管理，agent 只消费这一层接口。
 */
export function createAgentModelCatalogRuntime(): AgentModelCatalogRuntime {
  return {
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
  };
}
