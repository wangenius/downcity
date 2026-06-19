/**
 * 孤儿进程清扫工具。
 *
 * 关键点（中文）
 * - 处理“pid 文件不存在，但旧的 detached 进程还活着”的场景。
 * - 仅匹配 Downcity CLI 自己拉起的 `run` / `console run` / `agent start --foreground true`。
 * - 作为 stop/start 的兜底清理层，避免旧版本进程占住端口却无法被当前 pid 文件追踪。
 * - `run` 指 city runtime，`console run` 只用于清理旧 Console UI 进程。
 */
/**
 * 构建 detached 进程停机时的信号目标。
 *
 * 关键点（中文）
 * - POSIX 下 `detached: true` 会让子进程成为新的进程组 leader。
 * - `-pid` 表示向整个进程组发信号，可覆盖 ACP、shell、watcher 等孙进程。
 * - Windows 不支持负 pid 进程组语义，只能回退到单 pid。
 */
export declare function buildDetachedProcessSignalTargets(pid: number): number[];
/**
 * 向 detached 进程发送信号。
 *
 * 关键点（中文）
 * - 优先发送到进程组；失败后再尝试单 pid。
 * - 返回值只表示至少有一个目标接收到了信号，不代表进程已经退出。
 */
export declare function signalDetachedProcess(pid: number, signal: NodeJS.Signals): boolean;
export declare function isDowncityCliCommand(command: string): boolean;
/**
 * 判断命令行是否属于本次清扫目标。
 *
 * 关键点（中文）
 * - `Index.js run` 是 city runtime。
 * - `Index.js console run` 是旧 Console UI runtime。
 * - 两者都包含 `run`，因此必须按完整子命令匹配，不能只查 `run` 词元。
 */
export declare function shouldSweepDetachedBayCommand(command: string, params: {
    include_city_runtime?: boolean;
    include_legacy_console_ui?: boolean;
    include_agent?: boolean;
}): boolean;
/**
 * 只探测失联的 Downcity detached 进程，不执行停止动作。
 */
export declare function findDetachedBayProcesses(params?: {
    include_city_runtime?: boolean;
    include_legacy_console_ui?: boolean;
    include_agent?: boolean;
    excludePids?: number[];
}): Promise<Array<{
    pid: number;
    command: string;
}>>;
/**
 * 清扫失联的 Downcity detached 进程。
 */
export declare function sweepDetachedBayProcesses(params?: {
    include_city_runtime?: boolean;
    include_legacy_console_ui?: boolean;
    include_agent?: boolean;
    timeoutMs?: number;
    excludePids?: number[];
}): Promise<{
    matched: Array<{
        pid: number;
        command: string;
    }>;
    stopped: Array<{
        pid: number;
        command: string;
    }>;
    alive: Array<{
        pid: number;
        command: string;
    }>;
}>;
//# sourceMappingURL=ProcessSweep.d.ts.map