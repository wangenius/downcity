/**
 * AgentRuntimeAssembly 类型定义。
 *
 * 关键点（中文）
 * - 这里统一描述由本地 agent 装配、再挂入 AgentRuntime 的能力。
 * - plugin runtime / session / plugin 作者 API 只能消费这些稳定能力，不应直接依赖具体宿主实现。
 * - 当前先收敛路径与 plugin 配置持久化两类高频能力。
 */

import type { DowncityConfig } from "@/types/config/DowncityConfig.js";

/**
 * Agent 路径能力集合。
 */
export interface AgentPathRuntime {
  /**
   * 当前项目根目录。
   */
  projectRoot: string;
  /**
   * 当前 agent 的稳定标识。
   */
  agentId: string;
  /**
   * `.downcity` 根目录路径。
   */
  getDowncityDirPath(): string;
  /**
   * `.downcity/.cache` 目录路径。
   */
  getCacheDirPath(): string;
  /**
   * `.downcity/channel` 目录路径。
   */
  getDowncityChannelDirPath(): string;
  /**
   * `.downcity/channel/meta.json` 文件路径。
   */
  getDowncityChannelMetaPath(): string;
  /**
   * `.downcity/chat/<sessionId>/history.jsonl` 文件路径。
   */
  getDowncityChatHistoryPath(sessionId: string): string;
  /**
   * `.downcity/memory/MEMORY.md` 文件路径。
   */
  getDowncityMemoryLongTermPath(): string;
  /**
   * `.downcity/memory/daily` 目录路径。
   */
  getDowncityMemoryDailyDirPath(): string;
  /**
   * `.downcity/memory/daily/<date>.md` 文件路径。
   */
  getDowncityMemoryDailyPath(date: string): string;
  /**
   * `.downcity/agents/<agentId>/sessions` 根目录路径。
   */
  getDowncitySessionRootDirPath(): string;
  /**
   * `.downcity/agents/<agentId>/sessions/<sessionId>` 目录路径。
   */
  getDowncitySessionDirPath(sessionId: string): string;
}

/**
 * Plugin 配置持久化能力集合。
 */
export interface AgentPluginConfigRuntime {
  /**
   * 将当前 `plugins` 配置块写回项目 `downcity.json`。
   */
  persistProjectPlugins(plugins: DowncityConfig["plugins"] | undefined): Promise<string>;
}
