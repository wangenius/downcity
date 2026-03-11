/**
 * Manager 运行态类型定义。
 *
 * 关键点（中文）
 * - 统一沉淀 manager 维护的 agent registry 结构。
 * - 字段设计偏向“可恢复、可观测”，便于 status/list/stop-all 直接消费。
 */

/**
 * manager 侧登记的单个 agent 记录。
 */
export interface ManagedAgentRegistryEntry {
  /**
   * agent 项目根目录（绝对路径）。
   *
   * 关键点（中文）
   * - 作为唯一主键，避免同一项目重复登记。
   */
  projectRoot: string;

  /**
   * 最近一次登记时的 daemon pid。
   *
   * 关键点（中文）
   * - 用于展示“最后已知进程”，不是实时存活保证。
   */
  pid: number;

  /**
   * 首次登记时间（ISO8601）。
   *
   * 关键点（中文）
   * - 该时间随同一 projectRoot 的后续 upsert 保持不变。
   */
  startedAt: string;

  /**
   * 最近一次刷新时间（ISO8601）。
   *
   * 关键点（中文）
   * - 每次 upsert 都会更新，便于定位最后活跃点。
   */
  updatedAt: string;
}

/**
 * manager agent registry 文件结构（v1）。
 */
export interface ManagedAgentRegistryV1 {
  /**
   * schema 版本号（固定为 1）。
   */
  v: 1;

  /**
   * registry 最近一次整体更新时间（ISO8601）。
   */
  updatedAt: string;

  /**
   * 当前登记的 agent 列表。
   */
  agents: ManagedAgentRegistryEntry[];
}

/**
 * `sma manager agents list/status` 的运行时视图。
 */
export interface ManagedAgentRuntimeView {
  /**
   * agent 项目根目录（绝对路径）。
   */
  projectRoot: string;

  /**
   * registry 中记录的 pid。
   */
  registeredPid: number;

  /**
   * 当前 `.ship/.debug/shipmyagent.pid` 读到的实时 pid。
   */
  daemonPid: number;

  /**
   * daemon 是否正在运行。
   */
  running: boolean;

  /**
   * 首次登记时间（ISO8601）。
   */
  startedAt: string;

  /**
   * 最近一次登记刷新时间（ISO8601）。
   */
  updatedAt: string;

  /**
   * daemon 日志文件路径。
   */
  logPath: string;
}
