/**
 * Cloudflare account 解析器。
 *
 * 关键点（中文）
 * - `city deploy` 面向 City 项目，不要求用户理解 Wrangler 的登录细节。
 * - 有明确 account id 时直接复用；没有时先尝试 Wrangler 自动识别。
 * - Wrangler 已登录但无法枚举 account 时，进入最小交互：重新登录或手动输入 account id。
 */
import type { FederationProjectDeployEnvFile } from "../../types/FederationProjectConfig.js";
/** Cloudflare account 解析参数。 */
export interface ResolveCloudflareAccountParams {
    /** City 项目目录。 */
    project_dir: string;
    /** 当前 City 本地部署环境。 */
    env_file: FederationProjectDeployEnvFile;
    /** 用户通过命令行或环境变量显式传入的 account id。 */
    account_id?: string;
}
/** Cloudflare account 解析结果。 */
export interface ResolveCloudflareAccountResult {
    /** Cloudflare account id。 */
    account_id?: string;
    /** 可能写入 account id 后的本地部署环境。 */
    env_file: FederationProjectDeployEnvFile;
}
/**
 * 解析并准备 Cloudflare account。
 */
export declare function resolveCloudflareAccount(params: ResolveCloudflareAccountParams): Promise<ResolveCloudflareAccountResult>;
//# sourceMappingURL=CloudflareAccountResolver.d.ts.map