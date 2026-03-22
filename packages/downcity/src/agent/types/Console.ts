/**
 * Console（全局中台）运行态类型定义。
 *
 * 关键点（中文）
 * - console 负责“统一管理/观测多个 agent daemon”。
 * - console 会维护一个最小 registry（agents.json），用于 CLI 快速查看/批量停止。
 * - registry 不做健康检查，只记录“最后一次登记时的已知信息”，观测端会自行判活。
 */

/**
 * console 侧登记的单个 agent 记录。
 */
export interface ConsoleAgentRegistryEntry {
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
   * - 同一 projectRoot 的后续 upsert 保持不变，便于观察“已运行多久”。
   */
  startedAt: string;

  /**
   * 最近一次刷新时间（ISO8601）。
   *
   * 关键点（中文）
   * - 每次 upsert 都会更新，便于定位最后活跃点。
   */
  updatedAt: string;

  /**
   * 最近一次登记时的运行状态。
   *
   * 关键点（中文）
   * - `running`：当前已知 daemon 存活。
   * - `stopped`：历史记录（daemon 已停止）。
   */
  status?: "running" | "stopped";

  /**
   * 最近一次停止时间（ISO8601，可选）。
   *
   * 关键点（中文）
   * - 仅在 `status=stopped` 时有意义。
   */
  stoppedAt?: string;
}

/**
 * console agent registry 文件结构（v1）。
 */
export interface ConsoleAgentRegistryV1 {
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
  agents: ConsoleAgentRegistryEntry[];
}

/**
 * `city console agents/status` 的运行时视图。
 */
export interface ConsoleAgentRuntimeView {
  /**
   * agent 项目根目录（绝对路径）。
   */
  projectRoot: string;

  /**
   * registry 中记录的 pid。
   */
  registeredPid: number;

  /**
   * 当前 `.ship/.debug/downcity.pid` 读到的实时 pid。
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
