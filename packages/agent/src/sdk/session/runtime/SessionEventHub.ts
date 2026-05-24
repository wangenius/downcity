/**
 * SessionEventHub：Session 级事件分发器。
 *
 * 关键点（中文）
 * - 收口 `Session.subscribe()` 的订阅/取消订阅能力。
 * - 只做未来事件广播，不做缓存、重放或背压管理。
 */

import type {
  AgentSessionEvent,
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";

/**
 * SessionEventHub：最小事件总线实现。
 */
export class SessionEventHub {
  private readonly subscribers = new Map<number, AgentSessionSubscriber>();
  private nextSubscriberId = 1;

  /**
   * 注册一个新的 Session 事件订阅者。
   */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe {
    const id = this.nextSubscriberId;
    this.nextSubscriberId += 1;
    this.subscribers.set(id, subscriber);

    return () => {
      this.subscribers.delete(id);
    };
  }

  /**
   * 广播一条 Session 事件。
   */
  publish(event: AgentSessionEvent): void {
    for (const subscriber of this.subscribers.values()) {
      try {
        subscriber(event);
      } catch {
        // ignore single subscriber failures
      }
    }
  }
}
