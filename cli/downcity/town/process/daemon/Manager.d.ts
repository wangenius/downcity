/**
 * Downcity daemon 管理（PID / 日志 / 启停）。
 *
 * 目标
 * - `town agent start`：后台启动（终端退出后仍运行）
 * - `town agent restart`：重启后台进程
 *
 * 约定
 * - 所有 daemon 相关文件都写入 `.downcity/debug/`，便于排查：
 *   - `downcity.pid`：进程 pid
 *   - `downcity.daemon.log`：stdout/stderr 合并日志
 *   - `downcity.daemon.json`：元数据（启动时间、参数等）
 */
import { type DaemonMeta, type DaemonStaleReason } from "../../process/daemon/Types.js";
/**
 * 计算 daemon pid 文件路径。
 */
export declare const getDaemonPidPath: (projectRoot: string) => string;
/**
 * 计算 daemon 日志文件路径。
 */
export declare const getDaemonLogPath: (projectRoot: string) => string;
/**
 * 计算 daemon 元数据文件路径。
 */
export declare const getDaemonMetaPath: (projectRoot: string) => string;
/**
 * 读取 daemon pid。
 *
 * 关键点（中文）
 * - 读取失败或内容非法统一返回 `null`，调用方走无进程分支。
 */
export declare const readDaemonPid: (projectRoot: string) => Promise<number | null>;
/**
 * 检查进程是否存活。
 */
export declare const isProcessAlive: (pid: number) => boolean;
/**
 * 读取 daemon meta（宽松模式）。
 *
 * 关键点（中文）
 * - 返回 null 表示文件缺失、解析失败或结构非法。
 * - 该函数用于状态展示，不抛异常。
 */
export declare const readDaemonMeta: (projectRoot: string) => Promise<DaemonMeta | null>;
/**
 * 诊断 stale 原因。
 */
export declare const diagnoseDaemonStaleReasons: (projectRoot: string, pid: number) => Promise<DaemonStaleReason[]>;
/**
 * 清理僵尸 daemon 标记文件。
 *
 * 算法（中文）
 * - 若 pid 文件存在但进程不存在，移除 pid/meta，恢复可重启状态。
 */
export declare const cleanupStaleDaemonFiles: (projectRoot: string) => Promise<void>;
/**
 * 写入 daemon pid 与元数据文件。
 */
export declare const writeDaemonFiles: (projectRoot: string, meta: DaemonMeta) => Promise<void>;
/**
 * 启动 daemon 子进程。
 *
 * 流程（中文）
 * 1) 清理脏 pid/meta
 * 2) 检查是否已有存活 daemon
 * 3) detached + unref 拉起 `node cli.js run ...`
 * 4) 写入 pid/meta 供 stop/restart 使用
 */
export declare const startDaemonProcess: (params: {
    projectRoot: string;
    cliPath: string;
    args: string[];
}) => Promise<{
    pid: number;
    logPath: string;
}>;
/**
 * 停止 daemon 子进程。
 *
 * 策略（中文）
 * - 先发 `SIGTERM` 做优雅退出；超时后回退 `SIGKILL`。
 * - 无论 stop 结果如何，最终清理 pid/meta，避免状态残留。
 */
export declare const stopDaemonProcess: (params: {
    projectRoot: string;
    timeoutMs?: number;
}) => Promise<{
    stopped: boolean;
    pid?: number;
}>;
//# sourceMappingURL=Manager.d.ts.map