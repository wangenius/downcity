/**
 * `city deploy` 命令实现。
 *
 * 关键点（中文）
 * - 命令层只负责读取目录、解析选项和选择 runtime deployer。
 * - 具体 Cloudflare / D1 / Wrangler 细节放在 runtime 模块中。
 * - `city.json` 是部署协议入口，避免用户直接记忆底层 Worker 脚本。
 */
/** Commander 传入的原始 deploy 选项。 */
export interface CityDeployCommandOptions {
    /** 是否只执行 dry-run。 */
    dryRun?: boolean;
    /** 是否部署后验证。 */
    verify?: boolean;
    /** 是否只执行验证。 */
    verifyOnly?: boolean;
    /** 是否跳过构建。 */
    skipBuild?: boolean;
    /** 是否跳过类型检查。 */
    skipTypecheck?: boolean;
    /** 本次部署使用的 Cloudflare account id。 */
    accountId?: string;
}
/**
 * 执行 City 项目部署。
 */
export declare function deployCityProject(source?: string, raw_options?: CityDeployCommandOptions): Promise<void>;
//# sourceMappingURL=deploy.d.ts.map