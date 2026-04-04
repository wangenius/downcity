/**
 * SessionExecutionState：session 执行状态追踪器。
 *
 * 关键点（中文）
 * - 只负责维护“哪些 session 正在执行”。
 * - 不负责 run 编排，也不负责消息持久化。
 * - 这样 `SessionStore` 就不需要自己直接维护可变 Set 状态。
 */

/**
 * Session 执行状态追踪器。
 */
export class SessionExecutionState {
  private readonly executingSessionIds: Set<string> = new Set();

  /**
   * 标记某个 session 开始执行。
   */
  start(sessionId: string): void {
    const key = String(sessionId || "").trim();
    if (!key) return;
    this.executingSessionIds.add(key);
  }

  /**
   * 标记某个 session 结束执行。
   */
  finish(sessionId: string): void {
    const key = String(sessionId || "").trim();
    if (!key) return;
    this.executingSessionIds.delete(key);
  }

  /**
   * 判断指定 session 是否正在执行。
   */
  isExecuting(sessionId: string): boolean {
    const key = String(sessionId || "").trim();
    if (!key) return false;
    return this.executingSessionIds.has(key);
  }

  /**
   * 返回当前正在执行的 session id 列表。
   */
  listExecutingSessionIds(): string[] {
    return [...this.executingSessionIds];
  }

  /**
   * 返回当前执行中的 session 数量。
   */
  getExecutingSessionCount(): number {
    return this.executingSessionIds.size;
  }
}
