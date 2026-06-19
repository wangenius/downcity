/**
 * City 项目版本号管理。
 *
 * 关键点（中文）
 * - `city deploy` 只在真实部署前自动执行 patch bump。
 * - 版本号来源统一使用目标项目根目录下的 package.json。
 * - 版本处理逻辑放在 CLI 内部，避免依赖仓库外部脚本。
 * - 老项目如果还没有 version，会在首次真实部署时自动初始化为 `0.0.1`。
 */
/**
 * 项目版本号 patch bump 结果。
 */
export interface ProjectVersionBumpResult {
    /**
     * package.json 绝对路径。
     */
    package_json_path: string;
    /**
     * bump 前版本号。
     */
    previous_version: string;
    /**
     * bump 后版本号。
     */
    next_version: string;
}
/**
 * 对 City 项目 package.json 执行 patch 版本号自增。
 */
export declare function bumpProjectPatchVersion(project_dir: string): ProjectVersionBumpResult;
//# sourceMappingURL=ProjectVersionManager.d.ts.map