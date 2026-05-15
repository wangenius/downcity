/**
 * SDK AsyncQueue。
 *
 * 关键点（中文）
 * - 用于把 callback 风格的 stream 事件桥接成 `AsyncIterable`。
 * - 保持实现轻量，不引入额外第三方依赖。
 */

type QueueState<T> = {
  /**
   * 已入队但尚未消费的值。
   */
  values: T[];

  /**
   * 等待中的消费者回调。
   */
  waiters: Array<(result: IteratorResult<T>) => void>;

  /**
   * 队列是否已关闭。
   */
  closed: boolean;
};

/**
 * 极简异步队列。
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly state: QueueState<T> = {
    values: [],
    waiters: [],
    closed: false,
  };

  /**
   * 推入一个值。
   */
  push(value: T): void {
    if (this.state.closed) return;
    const waiter = this.state.waiters.shift();
    if (waiter) {
      waiter({
        done: false,
        value,
      });
      return;
    }
    this.state.values.push(value);
  }

  /**
   * 关闭队列。
   */
  close(): void {
    if (this.state.closed) return;
    this.state.closed = true;
    while (this.state.waiters.length > 0) {
      const waiter = this.state.waiters.shift();
      if (!waiter) continue;
      waiter({
        done: true,
        value: undefined as T,
      });
    }
  }

  /**
   * 返回异步迭代器。
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.state.values.length > 0) {
          return Promise.resolve({
            done: false,
            value: this.state.values.shift() as T,
          });
        }
        if (this.state.closed) {
          return Promise.resolve({
            done: true,
            value: undefined as T,
          });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.state.waiters.push(resolve);
        });
      },
    };
  }
}
