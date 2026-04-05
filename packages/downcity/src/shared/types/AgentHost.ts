/**
 * Agent 宿主能力类型定义。
 *
 * 关键点（中文）
 * - 这里统一描述由 main 装配、再挂入 AgentRuntime 的宿主能力。
 * - services / sessions / plugins 只能消费这些稳定能力，不应直接依赖 `main/*` 实现。
 * - 当前先收敛路径、认证、plugin 配置持久化三类高频能力。
 */

import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";

/**
 * Agent 路径能力集合。
 */
export interface AgentPathRuntime {
  /**
   * 当前项目根目录。
   */
  projectRoot: string;
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
   * `.downcity/memory/index.sqlite` 文件路径。
   */
  getDowncityMemoryIndexPath(): string;
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
   * `.downcity/session` 根目录路径。
   */
  getDowncitySessionRootDirPath(): string;
  /**
   * `.downcity/session/<sessionId>` 目录路径。
   */
  getDowncitySessionDirPath(sessionId: string): string;
}

/**
 * Agent 认证能力集合。
 */
export interface AgentAuthRuntime {
  /**
   * 为 agent 内部子进程应用统一认证环境。
   */
  applyInternalAgentAuthEnv(params: {
    /**
     * 待写入的目标环境变量集合。
     */
    targetEnv: NodeJS.ProcessEnv;
    /**
     * 可选来源环境变量集合。
     */
    sourceEnv?: NodeJS.ProcessEnv;
    /**
     * 可选显式 token。
     */
    token?: string;
  }): void;
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
