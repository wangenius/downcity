/**
 * ContextManager：会话生命周期编排器（main 层）。
 *
 * 关键职责（中文）
 * - 管理 contextId -> Agent/Persistor 缓存。
 * - 负责用户消息与助手消息入库。
 * - 在上下文更新后触发维护回调。
 */

import type { LanguageModel } from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import { withRequestContext } from "@main/runtime/RequestContext.js";
import type { RequestContext } from "@main/runtime/RequestContext.js";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@main/types/ContextMessage.js";
import type { AgentResult } from "@main/types/Agent.js";
import type { JsonObject } from "@/types/Json.js";
import { Agent } from "@main/agent/Agent.js";
import { PersistorComponent } from "@main/agent/components/PersistorComponent.js";
import { CompactorComponent } from "@main/agent/components/CompactorComponent.js";
import { OrchestratorComponent } from "@main/agent/components/OrchestratorComponent.js";
import { SystemerComponent } from "@main/agent/components/SystemerComponent.js";

/**
 * ContextManager：统一会话运行管理容器。
 */
export class ContextManager {
  private readonly agentsByContextId: Map<string, Agent> = new Map();
  private readonly persistorsByContextId: Map<string, PersistorComponent> =
    new Map();

  private readonly agentModel?: LanguageModel;
  private readonly agentLogger?: Logger;
  private readonly createPersistor: (contextId: string) => PersistorComponent;
  private readonly compactor: CompactorComponent;
  private readonly orchestrator: OrchestratorComponent;
  private readonly systemer: SystemerComponent;
  private readonly runAfterContextUpdated?: (contextId: string) => Promise<void>;

  /**
   * 构造函数：装配组件。
   */
  constructor(params: {
    agentModel?: LanguageModel;
    agentLogger?: Logger;
    createPersistor: (contextId: string) => PersistorComponent;
    compactor: CompactorComponent;
    orchestrator: OrchestratorComponent;
    systemer: SystemerComponent;
    runAfterContextUpdated?: (contextId: string) => Promise<void>;
  }) {
    if (typeof params.createPersistor !== "function") {
      throw new Error("ContextManager requires createPersistor");
    }
    this.agentModel = params.agentModel;
    this.agentLogger = params.agentLogger;
    this.createPersistor = params.createPersistor;
    this.compactor = params.compactor;
    this.orchestrator = params.orchestrator;
    this.systemer = params.systemer;
    this.runAfterContextUpdated = params.runAfterContextUpdated;
  }

  /**
   * 获取（或创建）Persistor。
   */
  getPersistor(contextId: string): PersistorComponent {
    const key = String(contextId || "").trim();
    if (!key) {
      throw new Error("ContextManager.getPersistor requires a non-empty contextId");
    }

    const existing = this.persistorsByContextId.get(key);
    if (existing) return existing;
    const created = this.createPersistor(key);
    this.persistorsByContextId.set(key, created);
    return created;
  }

  /**
   * 获取（或创建）Agent。
   */
  getAgent(contextId: string): Agent {
    const key = String(contextId || "").trim();
    if (!key) {
      throw new Error("ContextManager.getAgent requires a non-empty contextId");
    }
    const existing = this.agentsByContextId.get(key);
    if (existing) return existing;
    if (!this.agentModel || !this.agentLogger) {
      throw new Error(
        "ContextManager agent runtime is missing. Ensure runtime injects model/logger before calling getAgent().",
      );
    }

    const created = new Agent({
      model: this.agentModel,
      logger: this.agentLogger,
      persistor: this.getPersistor(key),
      compactor: this.compactor,
      orchestrator: this.orchestrator,
      systemer: this.systemer,
    });
    this.agentsByContextId.set(key, created);
    return created;
  }

  /**
   * 执行一次 Agent run（统一调用链）。
   *
   * 关键点（中文）
   * - 收敛 getAgent + withRequestContext + agent.run。
   * - 调用方只传 contextId/query 与可选运行态覆盖参数。
   */
  async run(params: {
    contextId: string;
    query: string;
    requestContext?: Omit<RequestContext, "contextId">;
  }): Promise<AgentResult> {
    const contextId = String(params.contextId || "").trim();
    if (!contextId) {
      throw new Error("ContextManager.run requires a non-empty contextId");
    }
    const query = String(params.query || "").trim();
    const agent = this.getAgent(contextId);
    const requestContext = params.requestContext || {};
    return await withRequestContext(
      {
        contextId,
        ...requestContext,
      },
      () => agent.run({ query }),
    );
  }

  /**
   * 清理 Agent 缓存。
   */
  clearAgent(contextId?: string): void {
    if (typeof contextId === "string" && contextId.trim()) {
      this.agentsByContextId.delete(contextId.trim());
      return;
    }
    this.agentsByContextId.clear();
  }

  /**
   * 触发会话更新回调。
   */
  async afterContextUpdatedAsync(contextId: string): Promise<void> {
    const key = String(contextId || "").trim();
    if (!key) return;
    if (!this.runAfterContextUpdated) return;
    try {
      await this.runAfterContextUpdated(key);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 user 消息到历史。
   */
  async appendUserMessage(params: {
    contextId: string;
    text: string;
    requestId?: string;
    extra?: JsonObject;
  }): Promise<void> {
    const contextId = String(params.contextId || "").trim();
    if (!contextId) return;

    try {
      const persistor = this.getPersistor(contextId);
      const msg = persistor.userText({
        text: params.text,
        metadata: {
          contextId,
          requestId: params.requestId,
          extra: params.extra,
        } as Omit<ContextMetadataV1, "v" | "ts">,
      });
      await persistor.append(msg);
      void this.afterContextUpdatedAsync(contextId);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 assistant 消息到历史。
   */
  async appendAssistantMessage(params: {
    contextId: string;
    message?: ContextMessageV1 | null;
    fallbackText?: string;
    requestId?: string;
    extra?: JsonObject;
  }): Promise<void> {
    const contextId = String(params.contextId || "").trim();
    if (!contextId) return;

    try {
      const persistor = this.getPersistor(contextId);
      const message = params.message;
      if (message && typeof message === "object") {
        await persistor.append(message);
        void this.afterContextUpdatedAsync(contextId);
        return;
      }

      const fallbackText = String(params.fallbackText || "").trim();
      if (!fallbackText) return;

      await persistor.append(
        persistor.assistantText({
          text: fallbackText,
          metadata: {
            contextId,
            requestId: params.requestId,
            extra: params.extra,
          },
          kind: "normal",
          source: "egress",
        }),
      );
      void this.afterContextUpdatedAsync(contextId);
    } catch {
      // ignore
    }
  }
}
