/**
 * `town update`：更新当前全局安装来源对应的 downcity CLI 聚合包。
 *
 * 关键点（中文）
 * - 优先根据当前 CLI 所在的全局模块目录，自动判断是 npm 还是 pnpm 安装。
 * - 允许用户通过 `--manager` 显式覆盖包管理器选择。
 * - 实际更新只负责全局包升级，不自动重启已有 runtime/Console 进程。
 */
export type UpdateManager = "npm" | "pnpm";
export interface UpdateCommandOptions {
    /**
     * 包管理器选择。
     *
     * - `auto`：按当前 CLI 所在的全局目录自动判断。
     * - `npm` / `pnpm`：强制使用指定包管理器。
     */
    manager?: UpdateManager | "auto";
}
/**
 * 检测当前 CLI 实际安装来源的包名。
 */
export declare function detectInstalledPackageName(): string;
export declare function buildGlobalUpdateInvocation(manager: UpdateManager, packageName: string): {
    command: string;
    args: string[];
};
/**
 * 根据全局模块根目录判断当前 CLI 来源。
 */
export declare function resolveUpdateManagerFromGlobalRoots(params: {
    packageRoot: string;
    npmRoot?: string;
    pnpmRoot?: string;
}): UpdateManager | null;
/**
 * 自动判断当前全局安装使用的包管理器。
 */
export declare function detectInstalledUpdateManager(): UpdateManager;
/**
 * update 命令入口。
 */
export declare function updateCommand(options?: UpdateCommandOptions): Promise<void>;
//# sourceMappingURL=Update.d.ts.map