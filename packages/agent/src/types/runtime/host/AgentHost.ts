/**
 * Agent 宿主能力类型定义。
 *
 * 关键点（中文）
 * - 这里统一描述由 agent runtime 装配、再挂入 AgentRuntime 的宿主能力。
 * - plugin runtime / session / plugin 作者 API 只能消费这些稳定能力，不应直接依赖具体宿主实现。
 * - 当前先收敛路径、模型目录、plugin 配置持久化三类高频能力。
 */

import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type {
  StoredModel,
  StoredModelProvider,
} from "@/types/runtime/host/Store.js";

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

/**
 * Agent 可见的模型目录能力集合。
 *
 * 关键点（中文）
 * - 这里只描述“模型池/模型目录”这一个专用端口，不再承载其他宿主能力。
 * - `Agent` 本体并不直接创建模型实例，只在初始化、启动校验、控制面展示时使用这些只读信息。
 */
export interface AgentModelCatalogRuntime {
  /**
   * 读取当前平台模型池中的全部模型。
   */
  listModels(): StoredModel[];
  /**
   * 读取当前平台模型池中的全部 provider。
   */
  listProviders(): Promise<StoredModelProvider[]>;
  /**
   * 按模型 ID 读取单个模型。
   */
  getModel(modelId: string): StoredModel | null;
}
