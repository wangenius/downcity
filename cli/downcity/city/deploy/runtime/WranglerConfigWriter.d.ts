/**
 * Wrangler 配置写入器。
 *
 * 关键点（中文）
 * - `city.json` 是简单的 City 项目声明，Wrangler 配置是部署时临时生成物。
 * - Cloudflare 默认值由 CLI 管理，用户不需要在 `city.json` 里写 worker_name 等细节。
 * - D1 database id 由 CLI 在部署时解析，不污染用户手写配置。
 */
import type { CityProjectConfigFile, CityProjectDeployEnvFile } from "../../types/CityProjectConfig.js";
/** 写入 wrangler.toml 的结果。 */
export interface WranglerConfigWriteResult {
    /** wrangler.toml 绝对路径。 */
    config_path: string;
}
/**
 * 根据 City 项目配置和本地部署环境写入临时 wrangler.toml。
 */
export declare function writeWranglerConfig(config_file: CityProjectConfigFile, env_file: CityProjectDeployEnvFile, database_id?: string): WranglerConfigWriteResult;
//# sourceMappingURL=WranglerConfigWriter.d.ts.map