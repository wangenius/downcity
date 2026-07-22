/**
 * canonical Tool Part 的并发等待门。
 *
 * Gate 只协调单个 `tool_call_id` 的可用状态，不接触 Message、Recorder 或
 * Tool 输入。不同 Tool 使用独立 Promise，因此不会形成全局执行锁。
 */

import type { SessionToolPartWaiter } from "@/types/session/SessionTool.js";

/** 按 Tool Call 隔离的 canonical Part 等待门。 */
export class SessionToolPartGate {
  private readonly available_tool_call_ids = new Set<string>();
  private readonly pending_waiters = new Map<string, SessionToolPartWaiter>();
  private closed_error: Error | null = null;

  /** 等待指定 Tool Part 成功持久化；已经可用时立即完成。 */
  wait_until_available(tool_call_id: string): Promise<void> {
    if (this.closed_error) return Promise.reject(this.closed_error);
    if (this.available_tool_call_ids.has(tool_call_id)) return Promise.resolve();

    const current = this.pending_waiters.get(tool_call_id);
    if (current) return current.promise;

    const waiter = this.create_waiter();
    this.pending_waiters.set(tool_call_id, waiter);
    return waiter.promise;
  }

  /** 标记指定 Tool Part 已持久化，并只释放该 Tool 的等待者。 */
  mark_available(tool_call_id: string): void {
    if (this.closed_error) throw this.closed_error;
    if (this.available_tool_call_ids.has(tool_call_id)) return;

    this.available_tool_call_ids.add(tool_call_id);
    const waiter = this.pending_waiters.get(tool_call_id);
    if (!waiter) return;
    this.pending_waiters.delete(tool_call_id);
    waiter.resolve();
  }

  /** 拒绝当前尚未出现 canonical Part 的全部等待者。 */
  reject_pending(reason: string): void {
    for (const [tool_call_id, waiter] of this.pending_waiters) {
      waiter.reject(new Error(`${reason}: ${tool_call_id}`));
    }
    this.pending_waiters.clear();
  }

  /** 永久关闭 Gate，并拒绝当前及后续等待。 */
  close(reason: string): void {
    if (this.closed_error) return;
    this.closed_error = new Error(reason);
    this.reject_pending(reason);
    this.available_tool_call_ids.clear();
  }

  /** 创建单个 Tool Call 使用的异步等待句柄。 */
  private create_waiter(): SessionToolPartWaiter {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolve_promise, reject_promise) => {
      resolve = resolve_promise;
      reject = reject_promise;
    });
    return { promise, resolve, reject };
  }
}
