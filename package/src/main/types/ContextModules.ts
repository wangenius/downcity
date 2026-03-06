/**
 * Context 模块类型（main 层）。
 *
 * 关键点（中文）
 * - `Agent` 保持 `run` 主流程稳定，差异化能力通过模块注入。
 * - 当前先收敛两类模块位：`history`（历史存储）与 `compactor`（上下文压缩）。
 */

import type { LanguageModel, SystemModelMessage } from "ai";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@main/types/ContextMessage.js";
import type { ShipContextMessagesMetaV1 } from "@main/types/ContextMessagesMeta.js";

/**
 * History 模块配置。
 */
export type MainContextHistoryModuleConfig = {
  /**
   * 历史存储驱动标识。
   *
   * 说明（中文）
   * - 当前实现固定为 `jsonl-file`。
   * - 该字段用于显式占位，后续可扩展 sqlite/redis 等实现。
   */
  driver: "jsonl-file";
};

/**
 * Compactor 模块执行输入。
 */
export type MainContextCompactorModuleInput = {
  /**
   * 项目根目录绝对路径。
   */
  rootPath: string;

  /**
   * 当前会话 ID。
   */
  contextId: string;

  /**
   * 上下文写锁执行器。
   *
   * 说明（中文）
   * - compactor 需要复用 persistor 的并发锁，避免 compact 与 append 互相覆盖。
   */
  withWriteLock: <T>(fn: () => Promise<T>) => Promise<T>;

  /**
   * 读取当前完整消息历史。
   */
  loadAll: () => Promise<ContextMessageV1[]>;

  /**
   * 构造 compact 摘要消息。
   */
  createSummaryMessage: (params: {
    /**
     * 摘要正文文本。
     */
    text: string;

    /**
     * 可选的来源范围元信息（from/to/count）。
     */
    sourceRange?: ContextMetadataV1["sourceRange"];
  }) => ContextMessageV1;

  /**
   * 归档目录路径提供器。
   */
  getArchiveDirPath: () => string;

  /**
   * messages.jsonl 文件路径提供器。
   */
  getMessagesFilePath: () => string;

  /**
   * 读取 meta（锁内版本）。
   */
  readMetaUnsafe: () => Promise<ShipContextMessagesMetaV1>;

  /**
   * 写入 meta（锁内版本）。
   */
  writeMetaUnsafe: (next: ShipContextMessagesMetaV1) => Promise<void>;

  /**
   * 当前运行模型实例。
   */
  model: LanguageModel;

  /**
   * 当前请求 system messages。
   */
  system: SystemModelMessage[];

  /**
   * 保留最近消息条数阈值。
   */
  keepLastMessages: number;

  /**
   * 近似输入 token 上限。
   */
  maxInputTokensApprox: number;

  /**
   * 是否归档被压缩掉的旧消息。
   */
  archiveOnCompact: boolean;
};

/**
 * Compactor 模块契约。
 */
export type MainContextCompactorModule = {
  /**
   * 模块标识名。
   */
  name: string;

  /**
   * 在必要时执行 compact。
   */
  compactIfNeeded(
    input: MainContextCompactorModuleInput,
  ): Promise<{ compacted: boolean; reason?: string }>;
};

/**
 * Compactor 模块配置。
 */
export type MainContextCompactorModuleConfig = {
  /**
   * compactor 模块实现。
   */
  module: MainContextCompactorModule;

  /**
   * 默认保留消息条数。
   */
  keepLastMessages?: number;

  /**
   * 默认输入 token 近似上限。
   */
  maxInputTokensApprox?: number;

  /**
   * 是否在 compact 时归档旧消息。
   */
  archiveOnCompact?: boolean;
};

/**
 * MainContextPersistor 模块配置集合。
 */
export type MainContextPersistorModules = {
  /**
   * history 模块配置。
   */
  history?: Partial<MainContextHistoryModuleConfig>;

  /**
   * compactor 模块配置。
   */
  compactor?: Partial<MainContextCompactorModuleConfig>;
};
