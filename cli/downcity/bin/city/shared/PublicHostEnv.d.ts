/**
 * City 公网 host 自动环境配置。
 *
 * 关键点（中文）
 * - `city start` 时自动探测公网 IPv4，并写入平台 Env 的 `DOWNCITY_PUBLIC_HOST`。
 * - 若部署环境已经注入 `DOWNCITY_PUBLIC_URL/HOST`，绝不覆盖。
 * - 写入平台 Env 后，后续 City 宿主会在启动 Agent/模型运行时前显式读取并传入。
 */
import type { BayPublicHostEnvResult, EnsureBayPublicHostEnvInput } from "../../city/shared/PublicHostEnvTypes.js";
/**
 * 确保 City 全局环境中存在自动探测的公网 host。
 */
export declare function ensureBayPublicHostEnv(input?: EnsureBayPublicHostEnvInput): Promise<BayPublicHostEnvResult>;
//# sourceMappingURL=PublicHostEnv.d.ts.map