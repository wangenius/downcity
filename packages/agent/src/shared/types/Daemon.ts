/**
 * 后台常驻（daemon）相关类型与常量。
 *
 * 关键点（中文）
 * - 这里统一描述 agent daemon 的 pid/log/meta 文件命名与元信息结构。
 * - city 全局后台的运行时文件命名不放在这里，而是放到 `main/city/runtime/CityPaths.ts`。
 */

/** daemon pid 文件名。 */
export const DAEMON_PID_FILENAME = "downcity.pid";
/** daemon 日志文件名。 */
export const DAEMON_LOG_FILENAME = "downcity.daemon.log";
/** daemon 元数据文件名。 */
export const DAEMON_META_FILENAME = "downcity.daemon.json";

/**
 * daemon 元数据文件结构。
 */
export interface DaemonMeta {
  /** 当前 daemon 进程的操作系统 pid。 */
  pid: number;
  /** daemon 所属 agent 项目的绝对路径。 */
  projectRoot: string;
  /** daemon 启动时间（ISO 时间字符串）。 */
  startedAt: string;
  /** 启动 daemon 时使用的命令。 */
  command: string;
  /** 启动 daemon 时使用的参数列表。 */
  args: string[];
  /** 当前 node 可执行文件路径。 */
  node: string;
  /** 当前运行平台。 */
  platform: NodeJS.Platform;
}

/**
 * daemon 进入 stale 状态的诊断项。
 */
export interface DaemonStaleReason {
  /**
   * 机器可读的原因编码。
   */
  code:
    | "process_not_alive"
    | "meta_missing"
    | "meta_invalid"
    | "meta_pid_mismatch"
    | "meta_project_mismatch";
  /**
   * 面向用户展示的原因说明。
   */
  message: string;
}
