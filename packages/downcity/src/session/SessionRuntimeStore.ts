/**
 * SessionRuntimeStore：session runtime 主入口。
 *
 * 关键点（中文）
 * - 这是新的主名称，表达“session runtime 获取与缓存的统一入口”。
 * - 它自己只负责 runtime 缓存；persistor 缓存下沉到 `SessionPersistorStore`。
 * - 对外继续提供 `getRuntime / getPersistor / clearRuntime` 统一接口。
 */

import type { LanguageModel, Tool } from "ai";
import type { Logger } from "@shared/utils/logger/Logger.js";
import { PersistorComponent } from "@session/components/PersistorComponent.js";
import { CompactorComponent } from "@session/components/CompactorComponent.js";
import { PrompterComponent } from "@session/components/PrompterComponent.js";
import { SessionRuntime } from "@session/SessionRuntime.js";
import { SessionPersistorStore } from "@session/runtime/SessionPersistorStore.js";
import type { SessionRuntimeLike } from "@/shared/types/SessionRuntime.js";

/**
 * SessionRuntimeStore 构造参数。
 */
type SessionRuntimeStoreOptions =
  | {
      /**
       * 已装配好的 persistor store。
       */
      persistorStore: {
        getPersistor(sessionId: string): PersistorComponent;
      };
      /**
       * 自定义 runtime 创建器。
       */
      createRuntime: (params: {
        sessionId: string;
        persistor: PersistorComponent;
      }) => SessionRuntimeLike;
    }
  | {
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

function hasRuntimeFactory(
  options: SessionRuntimeStoreOptions,
): options is Extract<SessionRuntimeStoreOptions, { createRuntime: unknown }> {
  return typeof (options as { createRuntime?: unknown }).createRuntime === "function";
}

/**
 * SessionRuntimeStore：runtime 统一缓存层。
 */
export class SessionRuntimeStore {
  private readonly persistorStore: {
    getPersistor(sessionId: string): PersistorComponent;
  };
  private readonly createRuntime: (params: {
    sessionId: string;
    persistor: PersistorComponent;
  }) => SessionRuntimeLike;
  private readonly runtimesBySessionId: Map<string, SessionRuntimeLike> = new Map();

  constructor(options: SessionRuntimeStoreOptions) {
    if (hasRuntimeFactory(options)) {
      this.persistorStore = options.persistorStore;
      this.createRuntime = options.createRuntime;
      return;
    }

    const persistorStore = new SessionPersistorStore({
      createPersistor: options.createPersistor,
    });
    this.persistorStore = persistorStore;
    this.createRuntime = ({ persistor }) =>
      new SessionRuntime({
        model: options.model,
        logger: options.logger,
        persistor,
        compactor: options.compactor,
        system: options.system,
        getTools: options.getTools,
      });
  }

  /**
   * 获取（或创建）Persistor。
   */
  getPersistor(sessionId: string): PersistorComponent {
    return this.persistorStore.getPersistor(sessionId);
  }

  /**
   * 获取（或创建）SessionRuntime。
   */
  getRuntime(sessionId: string): SessionRuntimeLike {
    const key = String(sessionId || "").trim();
    if (!key) {
      throw new Error(
        "SessionRuntimeStore.getRuntime requires a non-empty sessionId",
      );
    }

    const existing = this.runtimesBySessionId.get(key);
    if (existing) return existing;

    const created = this.createRuntime({
      sessionId: key,
      persistor: this.getPersistor(key),
    });
    this.runtimesBySessionId.set(key, created);
    return created;
  }

  /**
   * 清理 SessionRuntime 缓存。
   *
   * 关键点（中文）
   * - 这里只清 runtime，不清 persistor。
   * - persistor 的生命周期独立于 runtime 缓存。
   */
  clearRuntime(sessionId?: string): void {
    if (typeof sessionId === "string" && sessionId.trim()) {
      const key = sessionId.trim();
      const runtime = this.runtimesBySessionId.get(key);
      this.runtimesBySessionId.delete(key);
      void runtime?.dispose?.();
      return;
    }
    for (const runtime of this.runtimesBySessionId.values()) {
      void runtime.dispose?.();
    }
    this.runtimesBySessionId.clear();
  }
}
