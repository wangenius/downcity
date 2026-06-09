/**
 * CLI 统一错误类型。
 *
 * 关键点（中文）
 * - 所有命令层只 throw CliError，不再直接 process.exit。
 * - createVersionBanner 作为全局 catch point 统一渲染 CliError。
 * - 保证 --json 模式下也能输出结构化错误。
 */
/**
 * CLI 统一错误类。
 *
 * 说明（中文）
 * - 继承自 Error，保持 try/catch 兼容。
 * - 携带渲染所需的 metadata（exitCode / note / fix）。
 */
export class CliError extends Error {
    /** 进程退出码（默认 1）。 */
    exitCode;
    /** 错误补充说明。 */
    note;
    /** 修复建议。 */
    fix;
    constructor(params) {
        super(params.title);
        this.exitCode = params.exitCode ?? 1;
        this.note = params.note;
        this.fix = params.fix;
    }
}
//# sourceMappingURL=CliError.js.map