/**
 * SessionRuntimeRegistry：SessionRuntime 分流与缓存管理器。
 *
 * 关键点（中文）
 * - 管理 `sessionId -> SessionRuntime/Persistor` 映射。
 * - 把“创建哪个 session runtime、复用哪个 persistor”的职责从 SessionRegistry 中移出。
 * - 只负责分流与实例生命周期，不负责 request scope 绑定。
 */

import type { LanguageModel, Tool } from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import { PersistorComponent } from "@sessions/components/PersistorComponent.js";
import { CompactorComponent } from "@sessions/components/CompactorComponent.js";
import { PrompterComponent } from "@sessions/components/PrompterComponent.js";
import { SessionRuntime } from "@sessions/SessionRuntime.js";

/**
 * SessionRuntimeRegistry 构造参数。
 */
type SessionRuntimeRegistryOptions = {
  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 创建 session 对应的 persistor。
   */
  createPersistor: (sessionId: string) => PersistorComponent;

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
 * SessionRuntimeRegistry 默认实现。
 */
export class SessionRuntimeRegistry {
  private readonly model: LanguageModel;
  private readonly logger: Logger;
  private readonly createPersistor: SessionRuntimeRegistryOptions["createPersistor"];
  private readonly compactor: CompactorComponent;
  private readonly system: PrompterComponent;
  private readonly getTools: SessionRuntimeRegistryOptions["getTools"];
  private readonly runtimesBySessionId: Map<string, SessionRuntime> = new Map();
  private readonly persistorsBySessionId: Map<string, PersistorComponent> =
    new Map();

  constructor(options: SessionRuntimeRegistryOptions) {
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
  getPersistor(sessionId: string): PersistorComponent {
    const key = String(sessionId || "").trim();
    if (!key) {
      throw new Error(
        "SessionRuntimeRegistry.getPersistor requires a non-empty sessionId",
      );
    }

    const existing = this.persistorsBySessionId.get(key);
    if (existing) return existing;
    const created = this.createPersistor(key);
    this.persistorsBySessionId.set(key, created);
    return created;
  }

  /**
   * 获取（或创建）SessionRuntime。
   */
  getRuntime(sessionId: string): SessionRuntime {
    const key = String(sessionId || "").trim();
    if (!key) {
      throw new Error(
        "SessionRuntimeRegistry.getRuntime requires a non-empty sessionId",
      );
    }

    const existing = this.runtimesBySessionId.get(key);
    if (existing) return existing;
    const created = new SessionRuntime({
      model: this.model,
      logger: this.logger,
      persistor: this.getPersistor(key),
      compactor: this.compactor,
      system: this.system,
      getTools: this.getTools,
    });
    this.runtimesBySessionId.set(key, created);
    return created;
  }

  /**
   * 清理 SessionRuntime 缓存。
   */
  clearRuntime(sessionId?: string): void {
    if (typeof sessionId === "string" && sessionId.trim()) {
      this.runtimesBySessionId.delete(sessionId.trim());
      return;
    }
    this.runtimesBySessionId.clear();
  }
}
