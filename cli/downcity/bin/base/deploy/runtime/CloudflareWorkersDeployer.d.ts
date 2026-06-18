/**
 * Cloudflare Workers 部署器。
 *
 * 关键点（中文）
 * - `city deploy` 的用户心智是“部署一个 City 项目”，不是配置 Cloudflare 工程。
 * - 构建和类型检查从 package.json 自动推断，`federation.json` 保持最小。
 * - D1 等部署绑定写入项目 `.env`，Worker URL 回写到 City 自己的 server 配置。
 */
import type { FederationDeployOptions, FederationProjectConfigFile } from "../../types/FederationProjectConfig.js";
/**
 * 部署 Cloudflare Workers City 项目。
 */
export declare function deployCloudflareWorkers(config_file: FederationProjectConfigFile, options: FederationDeployOptions): Promise<void>;
//# sourceMappingURL=CloudflareWorkersDeployer.d.ts.map