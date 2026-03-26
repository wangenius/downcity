/**
 * SessionAgent：Session 场景运行装配器。
 *
 * 关键点（中文）
 * - 负责在当前 `sessionId` 作用域内装配 Agent 所需核心组件。
 * - 具体 run loop 仍由 `agent/Agent` 执行。
 */

import type { LanguageModel, Tool } from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import { Agent } from "@agent/Agent.js";
import { CompactorComponent } from "@agent/components/CompactorComponent.js";
import { PersistorComponent } from "@agent/components/PersistorComponent.js";
import { PrompterComponent } from "@agent/components/PrompterComponent.js";
import { RuntimeOrchestrator } from "@agent/context/context-agent/components/RuntimeOrchestrator.js";
import type { AgentResult, AgentRunInput } from "@agent/types/Agent.js";

type SessionAgentOptions = {
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
 * SessionAgent 默认实现。
 */
export class SessionAgent {
  private readonly agent: Agent;

  constructor(options: SessionAgentOptions) {
    this.agent = new Agent({
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
  async run(input: AgentRunInput): Promise<AgentResult> {
    return await this.agent.run(input);
  }
}
