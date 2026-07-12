/**
 * SessionMessage mutation 事件总线。
 *
 * EventHub 只广播 Recorder 已成功提交的 mutation，不创建或转换事件。
 */

import type {
  SessionMessageMutation,
  SessionMessageMutationSubscriber,
  SessionMessageMutationUnsubscribe,
} from "@/types/session/SessionMessageMutation.js";

/** SessionMessage mutation 的进程内广播器。 */
export class SessionMessageEventHub {
  private readonly subscribers = new Set<SessionMessageMutationSubscriber>();

  /** 订阅未来成功提交的 mutation。 */
  subscribe(subscriber: SessionMessageMutationSubscriber): SessionMessageMutationUnsubscribe {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /** 广播一条已持久化 mutation。 */
  publish(mutation: SessionMessageMutation): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(mutation);
      } catch {
        // 单个订阅者失败不能影响提交结果和其他订阅者。
      }
    }
  }
}
