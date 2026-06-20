/**
 * City 项目配置读取器。
 *
 * 关键点（中文）
 * - `federation.json` 保持极简：type、name、target。
 * - Cloudflare 细节由 CLI 默认处理，不要求开发者写一大段配置。
 * - 部署状态不写回 `federation.json`，避免用户手写协议被机器污染。
 */
import type { FederationProjectConfigFile } from "../../../federation/types/FederationProjectConfig.js";
/**
 * 读取指定目录下的 City 项目配置。
 */
export declare function readFederationProjectConfig(dir: string): FederationProjectConfigFile;
//# sourceMappingURL=FederationProjectConfigReader.d.ts.map