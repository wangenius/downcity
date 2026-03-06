/**
 * AgentComponent：Agent 能力组件基类。
 *
 * 关键点（中文）
 * - 仅定义最小公共生命周期能力，避免演化为“万能基类”。
 * - 业务行为由子类自行定义（Persistor/Compactor/Orchestrator/Prompter）。
 */
export abstract class AgentComponent {
  /**
   * 组件名称（用于日志与诊断）。
   */
  abstract readonly name: string;

  /**
   * 可选初始化钩子。
   *
   * 关键点（中文）
   * - Agent/Runtime 启动时可统一调用。
   * - 无需初始化的组件可不实现。
   */
  async init(): Promise<void> {
    // no-op
  }

  /**
   * 可选释放钩子。
   *
   * 关键点（中文）
   * - Runtime 关停时统一释放资源（连接、句柄、缓存等）。
   */
  async dispose(): Promise<void> {
    // no-op
  }
}
