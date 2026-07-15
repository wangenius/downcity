/**
 * AgentRuntimePorts 类型定义。
 *
 * 关键点（中文）
 * - 这里只描述 Agent 运行时依赖的宿主能力，不持有 Agent 状态。
 * - Plugin、Session 与宿主集成代码只消费这些稳定端口，不依赖具体存储实现。
 * - 当前先收敛路径与 plugin 配置持久化两类高频能力。
 */

import type { JsonObject } from "@/types/common/Json.js";

/**
 * Agent 路径能力集合。
 */
export interface AgentPathRuntime {
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
   * 将单个 Plugin 的配置合并写回宿主配置存储。
   *
   * @param plugin_name Plugin 稳定名称。
   * @param config Plugin 当前完整的 JSON 配置；传入 undefined 表示删除配置。
   */
  persist_plugin_config(
    plugin_name: string,
    config: JsonObject | undefined,
  ): Promise<string>;
}
