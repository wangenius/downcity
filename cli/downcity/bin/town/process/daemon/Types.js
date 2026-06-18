/**
 * Town Agent daemon 文件与元数据类型。
 *
 * 关键点（中文）
 * - daemon 是 Town 管理 Agent 独立进程的运行时概念。
 * - Agent SDK 不暴露 daemon 进程协议，只保留本地执行与 RPC 能力。
 */
/** daemon pid 文件名。 */
export const DAEMON_PID_FILENAME = "downcity.pid";
/** daemon 日志文件名。 */
export const DAEMON_LOG_FILENAME = "downcity.daemon.log";
/** daemon 元数据文件名。 */
export const DAEMON_META_FILENAME = "downcity.daemon.json";
//# sourceMappingURL=Types.js.map