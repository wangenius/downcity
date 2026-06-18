/**
 * Cloudflare D1 数据库解析器。
 *
 * 关键点（中文）
 * - D1 是 Workers 目标的运行时资源，由 `city deploy` 自动准备。
 * - 用户只需要理解 database name；database id 由 CLI 在部署时自动解析。
 * - `.env` 只保存 database name 与 binding，不暴露内部 database id。
 * - dry-run 不创建远程资源，只使用已有 database name 解析临时 Wrangler 配置。
 */
import type { CityProjectConfigFile, CityProjectDeployEnvFile } from "../../types/CityProjectConfig.js";
/** D1 解析参数。 */
export interface ResolveD1DatabaseParams {
    /** City 项目配置文件。 */
    config_file: CityProjectConfigFile;
    /** City 项目本地部署环境文件。 */
    env_file: CityProjectDeployEnvFile;
    /** Cloudflare account id。 */
    account_id?: string;
    /** 找不到同名数据库时是否允许创建。 */
    create_if_missing?: boolean;
}
/** D1 解析结果。 */
export interface ResolveD1DatabaseResult {
    /** 更新后的本地部署环境文件。 */
    env_file: CityProjectDeployEnvFile;
    /** 本次部署解析出的 D1 database id。 */
    resolved_database_id?: string;
}
/**
 * 确认 D1 数据库存在，必要时创建并写入项目 `.env`。
 */
export declare function resolveD1Database(params: ResolveD1DatabaseParams): Promise<ResolveD1DatabaseResult>;
//# sourceMappingURL=D1DatabaseResolver.d.ts.map