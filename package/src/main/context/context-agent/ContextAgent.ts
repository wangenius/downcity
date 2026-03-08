/**
 * ContextAgent：Context 场景运行装配器。
 *
 * 关键点（中文）
 * - 负责在当前 `contextId` 作用域内装配 Agent 所需核心组件。
 * - 具体 run loop 仍由 `main/agent/Agent` 执行。
 */

import type { LanguageModel, Tool } from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import { Agent } from "@main/agent/Agent.js";
import { CompactorComponent } from "@main/agent/components/CompactorComponent.js";
import { PersistorComponent } from "@main/agent/components/PersistorComponent.js";
import { PrompterComponent } from "@main/agent/components/PrompterComponent.js";
import { RuntimeOrchestrator } from "@main/context/context-agent/components/RuntimeOrchestrator.js";
import type { AgentResult, AgentRunInput } from "@main/types/Agent.js";

type ContextAgentOptions = {
  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 当前 context 对应的 persistor。
   */
  persistor: PersistorComponent;

  /**
   * 当前 context 对应的 compactor。
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
 * ContextAgent 默认实现。
 */
export class ContextAgent {
  private readonly agent: Agent;

  constructor(options: ContextAgentOptions) {
    this.agent = new Agent({
      model: options.model,
      logger: options.logger,
      persistor: options.persistor,
      compactor: options.compactor,
      prompter: options.system,
      orchestrator: new RuntimeOrchestrator({
        contextId: options.persistor.contextId,
        getTools: options.getTools,
      }),
    });
  }

  /**
   * 运行当前 context 的一次请求。
   */
  async run(input: AgentRunInput): Promise<AgentResult> {
    return await this.agent.run(input);
  }
}
