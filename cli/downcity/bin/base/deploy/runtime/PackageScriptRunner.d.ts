/**
 * City 项目 package scripts 执行器。
 *
 * 关键点（中文）
 * - 普通开发者不需要在 `federation.json` 里声明 build/typecheck。
 * - 如果项目 package.json 有对应 script，`city deploy` 自动执行。
 * - 没有 package.json 或没有脚本时安静跳过，保持最小项目可部署。
 */
/**
 * 自动执行 package.json 中的 build/typecheck。
 */
export declare function runPackageDeployScripts(params: {
    /** City 项目目录。 */
    project_dir: string;
    /** 是否跳过 build。 */
    skip_build: boolean;
    /** 是否跳过 typecheck。 */
    skip_typecheck: boolean;
}): Promise<void>;
//# sourceMappingURL=PackageScriptRunner.d.ts.map