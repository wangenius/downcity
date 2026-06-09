/**
 * City 部署命令执行器。
 *
 * 关键点（中文）
 * - 统一执行本地 shell 命令和 Wrangler 命令，集中处理失败提示。
 * - 使用 shell 执行 `city.json` 中的命令，允许用户写 pnpm / npm / bash 组合命令。
 * - 不在这里解析业务语义，部署步骤由 deployer 组合。
 */
/** 本地命令执行参数。 */
export interface RunCommandParams {
    /** 当前命令展示名。 */
    label: string;
    /** 要执行的 shell 命令。 */
    command: string;
    /** 命令工作目录。 */
    cwd: string;
    /** 额外环境变量。 */
    env?: Record<string, string | undefined>;
    /** 是否捕获 stdout。 */
    capture?: boolean;
}
/**
 * 执行 shell 命令。
 */
export declare function runCommand(params: RunCommandParams): Promise<string>;
//# sourceMappingURL=CommandRunner.d.ts.map