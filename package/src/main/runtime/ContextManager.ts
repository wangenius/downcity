/**
 * ContextManager：会话生命周期编排器（main 层）。
 *
 * 关键职责（中文）
 * - 管理 contextId -> Agent/ContextPersistor 缓存
 * - 负责消息入库与 agent/persistor 访问
 * - 在上下文更新后触发 memory 维护钩子
 */

import type { Tool, SystemModelMessage, LanguageModel } from "ai";
import { generateId } from "@utils/Id.js";
import type { Logger } from "@utils/logger/Logger.js";
import type { ContextMetadataV1 } from "@main/types/ContextMessage.js";
import type { ResolvedAgentSystemConfig } from "@main/types/AgentSystem.js";
import type { ContextPersistor } from "@main/agent/ContextPersistor.js";
import type { JsonObject } from "@/types/Json.js";
import { Agent } from "@main/agent/Agent.js";

/**
 * ContextManager：统一会话运行管理容器。
 *
 * 关键点（中文）
 * - 一个 contextId 对应一个 Agent 实例与一个 ContextPersistor 实例。
 * - ContextManager 只负责上下文对象组装与落盘，不处理调度。
 */
export class ContextManager {
  private readonly agentsByContextId: Map<string, Agent> = new Map();
  private readonly persistorsByContextId: Map<string, ContextPersistor> =
    new Map();

  private readonly runMemoryMaintenance?: (contextId: string) => Promise<void>;
  private readonly agentModel?: LanguageModel;
  private readonly agentLogger?: Logger;
  private readonly createPersistor: (contextId: string) => ContextPersistor;
  private readonly resolveAgentSystemMessages?: (params: {
    contextId: string;
    requestId: string;
    system: ResolvedAgentSystemConfig;
  }) => Promise<SystemModelMessage[]>;
  private agentTools: Record<string, Tool> = {};

  /**
   * 构造函数：装配可选回调。
   *
   * 关键点（中文）
   * - `runMemoryMaintenance` 由 service 注入，manager 只负责触发。
   */
  constructor(params: {
    runMemoryMaintenance?: (contextId: string) => Promise<void>;
    agentModel?: LanguageModel;
    agentLogger?: Logger;
    createPersistor: (contextId: string) => ContextPersistor;
    resolveAgentSystemMessages?: (params: {
      contextId: string;
      requestId: string;
      system: ResolvedAgentSystemConfig;
    }) => Promise<SystemModelMessage[]>;
  }) {
    if (typeof params.createPersistor !== "function") {
      throw new Error("ContextManager requires createPersistor");
    }
    this.runMemoryMaintenance = params.runMemoryMaintenance;
    this.agentModel = params.agentModel;
    this.agentLogger = params.agentLogger;
    this.createPersistor = params.createPersistor;
    this.resolveAgentSystemMessages = params.resolveAgentSystemMessages;
  }

  /**
   * 获取（或创建）ContextPersistor。
   */
  getContextPersistor(contextId: string): ContextPersistor {
    const key = String(contextId || "").trim();
    if (!key) {
      throw new Error(
        "ContextManager.getContextPersistor requires a non-empty contextId",
      );
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
        "ContextManager agent runtime is missing. Ensure runtime injects agent model/logger before calling getAgent().",
      );
    }
    const created = new Agent({
      model: this.agentModel,
      logger: this.agentLogger,
      persistor: this.getContextPersistor(key),
    });
    this.agentsByContextId.set(key, created);
    return created;
  }

  /**
   * 设置 Agent 全局工具集合。
   */
  setAgentTools(tools: Record<string, Tool>): void {
    this.agentTools = tools && typeof tools === "object" ? { ...tools } : {};
  }

  /**
   * 构建一次 Agent 运行所需上下文参数。
   */
  async createAgentRunContext(contextId: string): Promise<{
    requestId: string;
    system: SystemModelMessage[];
    tools: Record<string, Tool>;
  }> {
    const key = String(contextId || "").trim();
    if (!key) {
      throw new Error(
        "ContextManager.createAgentRunContext requires a non-empty contextId",
      );
    }
    const requestId = generateId();
    const agent = this.getAgent(key);
    const system = this.resolveAgentSystemMessages
      ? await this.resolveAgentSystemMessages({
          contextId: key,
          requestId,
          system: agent.getSystem(),
        })
      : [];
    return {
      requestId,
      system: Array.isArray(system) ? [...system] : [],
      tools: { ...this.agentTools },
    };
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
   * 触发 context 记忆维护。
   */
  async afterContextUpdatedAsync(contextId: string): Promise<void> {
    const key = String(contextId || "").trim();
    if (!key) return;
    if (!this.runMemoryMaintenance) return;
    try {
      await this.runMemoryMaintenance(key);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 user 消息到上下文消息流。
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
      const persistor = this.getContextPersistor(contextId);
      const msg = persistor.createUserTextMessage({
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
}
