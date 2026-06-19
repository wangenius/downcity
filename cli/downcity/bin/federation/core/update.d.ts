/**
 * CLI 自更新模块。
 *
 * 关键说明（中文）
 * - 在 downcity 仓库内执行时，优先走本地 workspace 刷新全局安装
 * - 普通全局安装环境下，退化为 `npm install -g downcity@latest`
 * - 更新完成后建议重新运行 CLI，避免当前进程继续使用旧代码
 */
/**
 * 执行 CLI 自更新。
 */
export declare function updateCli(cwd?: string): Promise<{
    mode: "workspace" | "npm";
    version: string;
}>;
/**
 * 读取当前全局安装的 CLI 版本。
 */
export declare function readInstalledCliVersion(): Promise<string>;
//# sourceMappingURL=update.d.ts.map