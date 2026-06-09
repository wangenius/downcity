/**
 * City 项目配置读取器。
 *
 * 关键点（中文）
 * - `city.json` 保持极简：type、name、target。
 * - Cloudflare 细节由 CLI 默认处理，不要求开发者写一大段配置。
 * - 部署状态不写回 `city.json`，避免用户手写协议被机器污染。
 */
import type { CityProjectConfigFile } from "../../types/CityProjectConfig.js";
/**
 * 读取指定目录下的 City 项目配置。
 */
export declare function readCityProjectConfig(dir: string): CityProjectConfigFile;
//# sourceMappingURL=CityProjectConfigReader.d.ts.map