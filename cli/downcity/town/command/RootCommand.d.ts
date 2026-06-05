/**
 * Town 根命令装配模块。
 *
 * 关键点（中文）
 * - `town` 只负责本机 Agent 宿主能力，不再混入 City 管理入口。
 * - Agent 生命周期、chat 与 plugin 命令仍按模块装配，避免入口文件膨胀。
 * - City 运维能力统一进入 `city` 命令。
 * - 本模块承载 commander 根命令，`src/index.ts` 只负责进程入口。
 */
/**
 * 执行 Town CLI。
 */
export declare function runTownCli(): Promise<void>;
//# sourceMappingURL=RootCommand.d.ts.map