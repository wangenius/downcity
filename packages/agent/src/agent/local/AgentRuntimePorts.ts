/**
 * AgentRuntimePorts：创建本地 Agent 所需的宿主能力端口。
 *
 * 关键点（中文）
 * - Agent 直接创建路径端口，并接收宿主注入的 Plugin 配置持久化端口。
 * - Plugin 与 Session 只消费稳定端口，不依赖 CLI 等具体宿主实现。
 * - 当前先收敛路径与 plugin 配置持久化两类宿主能力。
 * - SDK 默认不提供 plugin 配置存储；宿主必须显式注入持久化能力。
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
import type {
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "@/types/agent/AgentRuntimePorts.js";

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
  };
}

/**
 * 创建 plugin 配置持久化能力集合。
 */
export function createAgentPluginConfigRuntime(projectRoot: string): AgentPluginConfigRuntime {
  const rootPath = String(projectRoot || "").trim();
  return {
    async persist_plugin_config(): Promise<string> {
      throw new Error(
        "Plugin config persistence is not configured. Pass AgentOptions.plugin_config from the host.",
      );
    },
  };
}
