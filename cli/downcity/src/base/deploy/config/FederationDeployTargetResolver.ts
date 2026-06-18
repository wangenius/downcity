/**
 * City 部署目标解析器。
 *
 * 关键点（中文）
 * - `city deploy` 默认部署当前目录。
 * - `city deploy` 只处理本地目录；远程仓库应先通过 `city create <git-url>` 拉到本地。
 * - 部署命令不承担项目获取职责，避免部署状态没有明确归属。
 */

import { resolve } from "node:path";
import type { FederationDeployTarget } from "../../types/FederationProjectConfig.js";
import { CliError } from "../../shared/CliError.js";

/**
 * 解析部署目标。
 */
export async function resolveFederationDeployTarget(
  source: string | undefined,
): Promise<FederationDeployTarget> {
  const normalized_source = String(source || ".").trim() || ".";
  if (isGitUrl(normalized_source)) {
    throw new CliError({
      title: "city deploy only deploys local projects",
      note: `Received Git URL: ${normalized_source}`,
      fix: "Run `city create <git-url>` first, then `cd` into the created directory and run `city deploy`.",
    });
  }

  return {
    project_dir: resolve(normalized_source),
    source: normalized_source,
    local: true,
  };
}

/**
 * 判断输入是否像 Git URL。
 */
function isGitUrl(value: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/)/.test(value)
    || /^[^@\s]+@[^:\s]+:[^\s]+$/.test(value);
}
