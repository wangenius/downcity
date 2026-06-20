/**
 * `city deploy` 命令实现 —— 部署 Federation 项目。
 *
 * 关键点（中文）
 * - 命令层只负责读取目录、解析选项和选择 runtime deployer。
 * - 具体 Cloudflare / D1 / Wrangler 细节放在 runtime 模块中。
 * - `federation.json` 是部署协议入口，避免用户直接记忆底层 Worker 脚本（文件名保持 federation.json）。
 */
import { CliError } from "../../../shared/CliError.js";
import { readFederationProjectConfig } from "../../../federation/deploy/config/FederationProjectConfigReader.js";
import { deployCloudflareWorkers } from "../../../federation/deploy/runtime/CloudflareWorkersDeployer.js";
import { loadFederationProjectEnv } from "../../../federation/deploy/config/FederationProjectEnvLoader.js";
import { resolveFederationDeployTarget } from "../../../federation/deploy/config/FederationDeployTargetResolver.js";
/**
 * 执行 Federation 项目部署。
 */
export async function deployFederationProject(source = ".", raw_options = {}) {
    const options = {
        source,
        dry_run: raw_options.dryRun === true,
        verify: raw_options.verify === true,
        verify_only: raw_options.verifyOnly === true,
        skip_build: raw_options.skipBuild === true,
        skip_typecheck: raw_options.skipTypecheck === true,
        account_id: raw_options.accountId,
    };
    const target = await resolveFederationDeployTarget(options.source);
    const config_file = readFederationProjectConfig(target.project_dir);
    loadFederationProjectEnv(config_file.project_dir);
    switch (config_file.config.target) {
        case "cloudflare-workers":
            await deployCloudflareWorkers(config_file, options);
            return;
        default:
            throw new CliError({
                title: "Unsupported Federation target",
                note: `city deploy does not support ${config_file.config.target}.`,
            });
    }
}
//# sourceMappingURL=deploy.js.map