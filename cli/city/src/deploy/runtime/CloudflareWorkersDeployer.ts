/**
 * Cloudflare Workers 部署器。
 *
 * 关键点（中文）
 * - `city deploy` 的用户心智是“部署一个 City 项目”，不是配置 Cloudflare 工程。
 * - 构建和类型检查从 package.json 自动推断，`city.json` 保持最小。
 * - D1 和 Worker URL 等部署绑定写入项目 `.env`。
 */

import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { CliError } from "../../shared/CliError.js";
import type {
  CityDeployOptions,
  CityProjectConfigFile,
  CityProjectDeployEnvFile,
} from "../../types/CityProjectConfig.js";
import {
  readCityProjectDeployEnv,
  writeCityProjectDeployEnv,
} from "../config/CityProjectEnvLoader.js";
import { resolveCloudflareAccount } from "./CloudflareAccountResolver.js";
import { resolveD1Database } from "./D1DatabaseResolver.js";
import { writeWranglerConfig } from "./WranglerConfigWriter.js";
import { runCommand } from "./CommandRunner.js";
import { runPackageDeployScripts } from "./PackageScriptRunner.js";

/**
 * 部署 Cloudflare Workers City 项目。
 */
export async function deployCloudflareWorkers(
  config_file: CityProjectConfigFile,
  options: CityDeployOptions,
): Promise<void> {
  let env_file = readCityProjectDeployEnv(config_file.project_dir);

  emitCliBlock({
    tone: "accent",
    title: "City project",
    facts: [
      { label: "name", value: config_file.config.name },
      { label: "target", value: config_file.config.target },
      { label: "source", value: options.source },
      { label: "dir", value: config_file.project_dir },
    ],
  });

  if (options.verify_only) {
    await verifyWorker(env_file);
    return;
  }

  const account_result = await resolveCloudflareAccount({
    project_dir: config_file.project_dir,
    env_file,
    account_id: options.account_id,
  });
  const account_id = account_result.account_id;
  env_file = account_result.env_file;

  await runPackageDeployScripts({
    project_dir: config_file.project_dir,
    skip_build: options.skip_build,
    skip_typecheck: options.skip_typecheck,
  });

  if (!options.dry_run) {
    const d1_result = await resolveD1Database({
      config_file,
      env_file,
      account_id,
    });
    env_file = d1_result.env_file;
  }

  const wrangler_result = writeWranglerConfig(config_file, env_file);
  emitCliBlock({
    tone: "success",
    title: "Wrangler config generated",
    facts: [{ label: "file", value: wrangler_result.config_path }],
  });

  let output = "";
  try {
    output = await runWranglerDeploy(config_file, {
      account_id,
      config_path: wrangler_result.config_path,
      dry_run: options.dry_run,
    });
  } finally {
    rmSync(dirname(wrangler_result.config_path), { recursive: true, force: true });
  }

  const worker_url = extractWorkerUrl(output);
  if (worker_url && !options.dry_run) {
    env_file = writeCityProjectDeployEnv(env_file, {
      city_worker_url: worker_url,
    });
  }

  emitCliBlock({
    tone: "success",
    title: options.dry_run ? "Worker dry-run completed" : "Worker deployed",
    facts: [
      { label: "worker", value: config_file.config.name },
      ...(worker_url ? [{ label: "url", value: worker_url }] : []),
    ],
  });

  if (options.verify && !options.dry_run) {
    await verifyWorker(env_file);
  }
}

/**
 * 执行 Wrangler deploy。
 */
async function runWranglerDeploy(
  config_file: CityProjectConfigFile,
  params: {
    account_id?: string;
    config_path: string;
    dry_run: boolean;
  },
): Promise<string> {
  return await runCommand({
    label: params.dry_run ? "Wrangler dry-run" : "Wrangler deploy",
    command: params.dry_run
      ? `pnpm exec wrangler deploy --config ${shellQuote(params.config_path)} --dry-run`
      : `pnpm exec wrangler deploy --config ${shellQuote(params.config_path)}`,
    cwd: config_file.project_dir,
    env: { CLOUDFLARE_ACCOUNT_ID: params.account_id },
    capture: true,
  });
}

/**
 * 验证 Worker 健康状态。
 */
async function verifyWorker(env_file: CityProjectDeployEnvFile): Promise<void> {
  const base_url = process.env.DOWNCITY_WORKER_URL
    ?? process.env.CITY_WORKER_URL
    ?? env_file.env.city_worker_url;
  if (!base_url?.trim()) {
    emitCliBlock({
      tone: "warning",
      title: "Verification skipped",
      note: "Set CITY_WORKER_URL or DOWNCITY_WORKER_URL in the project .env to check /health.",
    });
    return;
  }

  const url = `${base_url.replace(/\/+$/, "")}/health`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new CliError({
      title: "Worker verification failed",
      note: `${url} returned HTTP ${response.status}.`,
      fix: "Check the deployed Worker URL and Cloudflare deployment logs.",
    });
  }

  const text = await response.text();
  emitCliBlock({
    tone: "success",
    title: "Worker verified",
    facts: [
      { label: "url", value: url },
      { label: "status", value: String(response.status) },
    ],
    note: text.length > 240 ? `${text.slice(0, 240)}...` : text,
  });
}

/**
 * 从 Wrangler 输出中提取 Worker URL。
 */
function extractWorkerUrl(output: string): string | undefined {
  return output.match(/https:\/\/[^\s]+\.workers\.dev/i)?.[0];
}

/**
 * shell 参数转义。
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
