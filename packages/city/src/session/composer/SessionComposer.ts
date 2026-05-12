/**
 * SessionComposer：Session Composer 层的最小公共基类。
 *
 * 关键点（中文）
 * - 这里只提供统一的生命周期壳，不承载具体业务语义。
 * - 具体职责必须由子类自己表达，例如 HistoryStore / CompactionPolicy / SystemResolver / ExecutionComposer。
 */
export abstract class SessionComposer {
  /**
   * Composer 名称（用于日志与诊断）。
   */
  abstract readonly name: string;

  /**
   * 可选初始化钩子。
   *
   * 关键点（中文）
   * - LocalSessionExecutor 启动时可统一调用。
   * - 无需初始化的 Composer 可不实现。
   */
  async init(): Promise<void> {
    // no-op
  }

  /**
   * 可选释放钩子。
   *
   * 关键点（中文）
   * - Session 运行时关停时统一释放资源（连接、句柄、缓存等）。
   */
  async dispose(): Promise<void> {
    // no-op
  }
}
