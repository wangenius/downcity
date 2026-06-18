/**
 * `city deploy` 命令实现。
 *
 * 关键点（中文）
 * - 命令层只负责读取目录、解析选项和选择 runtime deployer。
 * - 具体 Cloudflare / D1 / Wrangler 细节放在 runtime 模块中。
 * - `city.json` 是部署协议入口，避免用户直接记忆底层 Worker 脚本。
 */
import { CliError } from "../../shared/CliError.js";
import { readCityProjectConfig } from "../config/CityProjectConfigReader.js";
import { deployCloudflareWorkers } from "../runtime/CloudflareWorkersDeployer.js";
import { loadCityProjectEnv } from "../config/CityProjectEnvLoader.js";
import { resolveCityDeployTarget } from "../config/CityDeployTargetResolver.js";
/**
 * 执行 City 项目部署。
 */
export async function deployCityProject(source = ".", raw_options = {}) {
    const options = {
        source,
        dry_run: raw_options.dryRun === true,
        verify: raw_options.verify === true,
        verify_only: raw_options.verifyOnly === true,
        skip_build: raw_options.skipBuild === true,
        skip_typecheck: raw_options.skipTypecheck === true,
        account_id: raw_options.accountId,
    };
    const target = await resolveCityDeployTarget(options.source);
    const config_file = readCityProjectConfig(target.project_dir);
    loadCityProjectEnv(config_file.project_dir);
    switch (config_file.config.target) {
        case "cloudflare-workers":
            await deployCloudflareWorkers(config_file, options);
            return;
        default:
            throw new CliError({
                title: "Unsupported City target",
                note: `city deploy does not support ${config_file.config.target}.`,
            });
    }
}
//# sourceMappingURL=deploy.js.map