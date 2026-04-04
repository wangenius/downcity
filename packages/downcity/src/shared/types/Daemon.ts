/**
 * 后台常驻（daemon）相关类型与常量。
 */

export const DAEMON_PID_FILENAME = "downcity.pid";
export const DAEMON_LOG_FILENAME = "downcity.daemon.log";
export const DAEMON_META_FILENAME = "downcity.daemon.json";

export interface DaemonMeta {
  pid: number;
  projectRoot: string;
  startedAt: string;
  command: string;
  args: string[];
  node: string;
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
