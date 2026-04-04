/**
 * SessionRuntime：Session 场景运行装配器。
 *
 * 关键点（中文）
 * - 负责在当前 `sessionId` 作用域内装配 Session 所需核心组件。
 * - 具体 run loop 仍由 `SessionCore` 执行。
 */

import type { LanguageModel, Tool } from "ai";
import type { Logger } from "@shared/utils/logger/Logger.js";
import { SessionCore } from "@session/SessionCore.js";
import { CompactorComponent } from "@session/components/CompactorComponent.js";
import { PersistorComponent } from "@session/components/PersistorComponent.js";
import { PrompterComponent } from "@session/components/PrompterComponent.js";
import { RuntimeOrchestrator } from "@session/runtime/RuntimeOrchestrator.js";
import type { SessionRunResult, SessionRunInput } from "@/shared/types/SessionRun.js";

type SessionRuntimeOptions = {
  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 当前 session 对应的 persistor。
   */
  persistor: PersistorComponent;

  /**
   * 当前 session 对应的 compactor。
   */
  compactor: CompactorComponent;

  /**
   * system 解析器。
   */
  system: PrompterComponent;

  /**
   * 获取当前可用工具集合。
   */
  getTools: () => Record<string, Tool>;
};

/**
 * SessionRuntime 默认实现。
 */
export class SessionRuntime {
  private readonly core: SessionCore;

  constructor(options: SessionRuntimeOptions) {
    this.core = new SessionCore({
      model: options.model,
      logger: options.logger,
      persistor: options.persistor,
      compactor: options.compactor,
      prompter: options.system,
      orchestrator: new RuntimeOrchestrator({
        sessionId: options.persistor.sessionId,
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
