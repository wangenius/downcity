/**
 * City 部署目标解析器。
 *
 * 关键点（中文）
 * - `city deploy` 默认部署当前目录。
 * - 本地目录和 Git URL 都会解析成一个项目目录，再走同一套部署流程。
 * - 远程 Git 项目 clone 到临时目录，不污染当前工作区。
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { CityDeployTarget } from "../../types/CityProjectConfig.js";
import { runCommand } from "../runtime/CommandRunner.js";

/**
 * 解析部署目标。
 */
export async function resolveCityDeployTarget(
  source: string | undefined,
): Promise<CityDeployTarget> {
  const normalized_source = String(source || ".").trim() || ".";
  if (!isGitUrl(normalized_source)) {
    return {
      project_dir: resolve(normalized_source),
      source: normalized_source,
      remote: false,
    };
  }

  const temp_dir = await mkdtemp(join(tmpdir(), "downcity-city-deploy-"));
  await runCommand({
    label: "Clone City project",
    command: `git clone --depth 1 ${shellQuote(normalized_source)} .`,
    cwd: temp_dir,
  });
  return {
    project_dir: temp_dir,
    source: normalized_source,
    remote: true,
    cleanup: async () => {
      await rm(temp_dir, { recursive: true, force: true });
    },
  };
}

/**
 * 判断输入是否像 Git URL。
 */
function isGitUrl(value: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/)/.test(value)
    || /^[^@\s]+@[^:\s]+:[^\s]+$/.test(value);
}

/**
 * shell 参数转义。
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
