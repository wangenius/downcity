/**
 * AgentHostRuntime：装配 AgentRuntime 宿主能力。
 *
 * 关键点（中文）
 * - `main/agent/*` 负责创建这些宿主能力对象，再注入到 AgentRuntime。
 * - services / session / plugins 只消费这些对象，不再直接 import `main/*`。
 * - 当前先收敛路径与 plugin 配置持久化两类宿主能力。
 */
import {
  getCacheDirPath,
  getDowncityChannelDirPath,
  getDowncityChannelMetaPath,
  getDowncityChatHistoryPath,
  getDowncityDirPath,
  getDowncityMemoryDailyDirPath,
  getDowncityMemoryDailyPath,
  getDowncityMemoryIndexPath,
  getDowncityMemoryLongTermPath,
  getDowncitySessionDirPath,
  getDowncitySessionRootDirPath,
} from "@/main/city/env/Paths.js";
import { persistProjectPluginConfig } from "@/main/plugin/ProjectConfigStore.js";
import type {
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "@/shared/types/AgentHost.js";
import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";

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
    getDowncityMemoryIndexPath: () => getDowncityMemoryIndexPath(rootPath),
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
