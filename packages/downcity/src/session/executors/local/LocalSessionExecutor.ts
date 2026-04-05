/**
 * LocalSessionExecutor：Session 场景运行装配器。
 *
 * 关键点（中文）
 * - 负责在当前 `sessionId` 作用域内装配 Session 所需核心组件。
 * - 具体 run loop 仍由 `LocalSessionCore` 执行。
 */

import type { LanguageModel, Tool } from "ai";
import type { Logger } from "@shared/utils/logger/Logger.js";
import { LocalSessionCore } from "@session/executors/local/LocalSessionCore.js";
import { SessionCompactionComposer } from "@session/composer/compaction/SessionCompactionComposer.js";
import { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";
import { SessionSystemComposer } from "@session/composer/system/SessionSystemComposer.js";
import { LocalSessionExecutionComposer } from "@session/composer/execution/LocalSessionExecutionComposer.js";
import type { SessionRunResult, SessionRunInput } from "@/types/session/SessionRun.js";

type LocalSessionExecutorOptions = {
  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 当前 session 对应的历史存储。
   */
  historyComposer: SessionHistoryComposer;

  /**
   * 当前 session 对应的 compaction Composer。
   */
  compactionComposer: SessionCompactionComposer;

  /**
   * system 解析器。
   */
  systemComposer: SessionSystemComposer;

  /**
   * 获取当前可用工具集合。
   */
  getTools: () => Record<string, Tool>;
};

/**
 * LocalSessionExecutor 默认实现。
 */
export class LocalSessionExecutor {
  private readonly core: LocalSessionCore;

  constructor(options: LocalSessionExecutorOptions) {
    this.core = new LocalSessionCore({
      model: options.model,
      logger: options.logger,
      historyComposer: options.historyComposer,
      compactionComposer: options.compactionComposer,
      systemComposer: options.systemComposer,
      executionComposer: new LocalSessionExecutionComposer({
        sessionId: options.historyComposer.sessionId,
        getTools: options.getTools,
      }),
    });
  }

  /**
   * 运行当前 session 的一次请求。
   */
  async run(input: SessionRunInput): Promise<SessionRunResult> {
    return await this.core.run(input);
  }
}
