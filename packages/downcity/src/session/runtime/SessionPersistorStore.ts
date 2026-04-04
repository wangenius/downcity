/**
 * SessionPersistorStore：persistor 缓存层。
 *
 * 关键点（中文）
 * - 只负责 `sessionId -> persistor` 的获取与缓存。
 * - 不负责 SessionRuntime 的创建与缓存。
 * - 这样 persistor 生命周期就能独立于 runtime 缓存来管理。
 */

import { PersistorComponent } from "@session/components/PersistorComponent.js";

/**
 * SessionPersistorStore 构造参数。
 */
type SessionPersistorStoreOptions = {
  /**
   * 创建 session 对应的 persistor。
   */
  createPersistor: (sessionId: string) => PersistorComponent;
};

/**
 * SessionPersistorStore：persistor 统一缓存层。
 */
export class SessionPersistorStore {
  private readonly createPersistor: SessionPersistorStoreOptions["createPersistor"];
  private readonly persistorsBySessionId: Map<string, PersistorComponent> =
    new Map();

  constructor(options: SessionPersistorStoreOptions) {
    this.createPersistor = options.createPersistor;
  }

  /**
   * 获取（或创建）Persistor。
   */
  getPersistor(sessionId: string): PersistorComponent {
    const key = String(sessionId || "").trim();
    if (!key) {
      throw new Error(
        "SessionPersistorStore.getPersistor requires a non-empty sessionId",
      );
    }

    const existing = this.persistorsBySessionId.get(key);
    if (existing) return existing;

    const created = this.createPersistor(key);
    this.persistorsBySessionId.set(key, created);
    return created;
  }
}
