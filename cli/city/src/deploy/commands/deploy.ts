/**
 * `city deploy` 命令实现。
 *
 * 关键点（中文）
 * - 命令层只负责读取目录、解析选项和选择 runtime deployer。
 * - 具体 Cloudflare / D1 / Wrangler 细节放在 runtime 模块中。
 * - `city.json` 是部署协议入口，避免用户直接记忆底层 Worker 脚本。
 */

import { CliError } from "../../shared/CliError.js";
import type { CityDeployOptions } from "../../types/CityProjectConfig.js";
import { readCityProjectConfig } from "../config/CityProjectConfigReader.js";
import { deployCloudflareWorkers } from "../runtime/CloudflareWorkersDeployer.js";
import { loadCityProjectEnv } from "../config/CityProjectEnvLoader.js";
import { resolveCityDeployTarget } from "../config/CityDeployTargetResolver.js";

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
export async function deployCityProject(
  source: string = ".",
  raw_options: CityDeployCommandOptions = {},
): Promise<void> {
  const options: CityDeployOptions = {
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
