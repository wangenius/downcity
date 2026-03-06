/**
 * ContextAgentDispatcher：ContextAgent 分流与缓存管理器。
 *
 * 关键点（中文）
 * - 管理 `contextId -> ContextAgent/Persistor` 映射。
 * - 把“创建哪个 agent、复用哪个 persistor”的职责从 ContextManager 中移出。
 * - 只负责分流与实例生命周期，不负责 request scope 绑定。
 */

import type { LanguageModel, Tool } from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import { PersistorComponent } from "@main/agent/components/PersistorComponent.js";
import { CompactorComponent } from "@main/agent/components/CompactorComponent.js";
import { PrompterComponent } from "@main/agent/components/PrompterComponent.js";
import { ContextAgent } from "@main/context/context-agent/ContextAgent.js";

/**
 * ContextAgentDispatcher 构造参数。
 */
type ContextAgentDispatcherOptions = {
  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 创建 context 对应的 persistor。
   */
  createPersistor: (contextId: string) => PersistorComponent;

  /**
   * 消息压缩器。
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
 * ContextAgentDispatcher 默认实现。
 */
export class ContextAgentDispatcher {
  private readonly model: LanguageModel;
  private readonly logger: Logger;
  private readonly createPersistor: ContextAgentDispatcherOptions["createPersistor"];
  private readonly compactor: CompactorComponent;
  private readonly system: PrompterComponent;
  private readonly getTools: ContextAgentDispatcherOptions["getTools"];
  private readonly agentsByContextId: Map<string, ContextAgent> = new Map();
  private readonly persistorsByContextId: Map<string, PersistorComponent> =
    new Map();

  constructor(options: ContextAgentDispatcherOptions) {
    this.model = options.model;
    this.logger = options.logger;
    this.createPersistor = options.createPersistor;
    this.compactor = options.compactor;
    this.system = options.system;
    this.getTools = options.getTools;
  }

  /**
   * 获取（或创建）Persistor。
   */
  getPersistor(contextId: string): PersistorComponent {
    const key = String(contextId || "").trim();
    if (!key) {
      throw new Error(
        "ContextAgentDispatcher.getPersistor requires a non-empty contextId",
      );
    }

    const existing = this.persistorsByContextId.get(key);
    if (existing) return existing;
    const created = this.createPersistor(key);
    this.persistorsByContextId.set(key, created);
    return created;
  }

  /**
   * 获取（或创建）ContextAgent。
   */
  getAgent(contextId: string): ContextAgent {
    const key = String(contextId || "").trim();
    if (!key) {
      throw new Error(
        "ContextAgentDispatcher.getAgent requires a non-empty contextId",
      );
    }

    const existing = this.agentsByContextId.get(key);
    if (existing) return existing;
    const created = new ContextAgent({
      model: this.model,
      logger: this.logger,
      persistor: this.getPersistor(key),
      compactor: this.compactor,
      system: this.system,
      getTools: this.getTools,
    });
    this.agentsByContextId.set(key, created);
    return created;
  }

  /**
   * 清理 ContextAgent 缓存。
   */
  clearAgent(contextId?: string): void {
    if (typeof contextId === "string" && contextId.trim()) {
      this.agentsByContextId.delete(contextId.trim());
      return;
    }
    this.agentsByContextId.clear();
  }
}
