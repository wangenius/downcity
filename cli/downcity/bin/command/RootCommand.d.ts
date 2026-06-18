/**
 * Downcity CLI 根命令装配模块。
 *
 * 关键点（中文）
 * - `city` 是 Downcity 官方 CLI 入口，统一承载 City 管理与 Town/Agent 管理。
 * - `city base` — 管理 Downcity City 服务、账户、模型与资源。
 * - `city town` — 在本机启动和管理 Agent 宿主环境。
 * - 默认无参数时打开交互式 City 管理界面（保持向后兼容）。
 * - 本模块承载 commander 根命令，`src/index.ts` 只负责进程入口。
 */
/**
 * 执行 Downcity CLI。
 */
export declare function runDowncityCli(): Promise<void>;
//# sourceMappingURL=RootCommand.d.ts.map