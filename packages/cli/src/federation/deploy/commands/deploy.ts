/**
 * `city deploy` 命令实现 —— 部署 Federation 项目。
 *
 * 关键点（中文）
 * - 命令层只负责读取目录、解析选项和选择 runtime deployer。
 * - 具体 Cloudflare / D1 / Wrangler 细节放在 runtime 模块中。
 * - `federation.json` 是部署协议入口，避免用户直接记忆底层 Worker 脚本（文件名保持 federation.json）。
 */

import { CliError } from "@/shared/CliError.js";
import type { FederationDeployOptions } from "@/federation/types/FederationProjectConfig.js";
import { readFederationProjectConfig } from "@/federation/deploy/config/FederationProjectConfigReader.js";
import { deployCloudflareWorkers } from "@/federation/deploy/runtime/CloudflareWorkersDeployer.js";
import { resolveFederationDeployTarget } from "@/federation/deploy/config/FederationDeployTargetResolver.js";

/** Commander 传入的原始 deploy 选项。 */
export interface FederationDeployCommandOptions {
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
 * 执行 Federation 项目部署。
 */
export async function deployFederationProject(
  source: string = ".",
  raw_options: FederationDeployCommandOptions = {},
): Promise<void> {
  const options: FederationDeployOptions = {
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
