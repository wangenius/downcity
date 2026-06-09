/**
 * City 根命令装配模块。
 *
 * 关键点（中文）
 * - `city` 是 Downcity 官方的 City 管理命令，负责连接和管理 City 服务资源。
 * - 默认无参数时打开交互式 City 管理界面，脚本化场景则使用显式子命令。
 * - 本机 Agent 宿主、Console、daemon、start/status/run 等运行态命令属于 `town`。
 * - 本模块承载 commander 根命令，`src/index.ts` 只负责进程入口。
 */
/**
 * 执行 City CLI。
 */
export declare function runCityCli(): Promise<void>;
//# sourceMappingURL=RootCommand.d.ts.map