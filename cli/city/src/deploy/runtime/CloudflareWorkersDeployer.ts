/**
 * Cloudflare Workers 部署器。
 *
 * 关键点（中文）
 * - `city deploy` 的用户心智是“部署一个 City 项目”，不是配置 Cloudflare 工程。
 * - 构建和类型检查从 package.json 自动推断，`city.json` 保持最小。
 * - D1 和 Worker URL 等部署状态写入 `.city/deploy.json`。
 */

import { emitCliBlock } from "../../shared/CliReporter.js";
import { CliError } from "../../shared/CliError.js";
import type {
  CityDeployOptions,
  CityProjectConfigFile,
  CityProjectDeployStateFile,
} from "../../types/CityProjectConfig.js";
import { readCityProjectDeployState } from "../config/CityProjectDeployStateStore.js";
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
  let state_file = readCityProjectDeployState(config_file.project_dir);

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
    await verifyWorker(state_file);
    return;
  }

  const account_result = await resolveCloudflareAccount({
    project_dir: config_file.project_dir,
    state_file,
    account_id: options.account_id,
  });
  const account_id = account_result.account_id;
  state_file = account_result.state_file;

  await runPackageDeployScripts({
    project_dir: config_file.project_dir,
    skip_build: options.skip_build,
    skip_typecheck: options.skip_typecheck,
  });

  if (!options.dry_run) {
    const d1_result = await resolveD1Database({
      config_file,
      state_file,
      account_id,
    });
    state_file = d1_result.state_file;
  }

  const wrangler_result = writeWranglerConfig(config_file, state_file);
  emitCliBlock({
    tone: "success",
    title: "Wrangler config synced",
    facts: [{ label: "file", value: wrangler_result.config_path }],
  });

  await runWranglerDeploy(config_file, {
    account_id,
    dry_run: options.dry_run,
  });

  emitCliBlock({
    tone: "success",
    title: options.dry_run ? "Worker dry-run completed" : "Worker deployed",
    facts: [{ label: "worker", value: config_file.config.name }],
  });

  if (options.verify && !options.dry_run) {
    await verifyWorker(state_file);
  }
}

/**
 * 执行 Wrangler deploy。
 */
async function runWranglerDeploy(
  config_file: CityProjectConfigFile,
  params: {
    account_id?: string;
    dry_run: boolean;
  },
): Promise<void> {
  await runCommand({
    label: params.dry_run ? "Wrangler dry-run" : "Wrangler deploy",
    command: params.dry_run
      ? "pnpm exec wrangler deploy --dry-run"
      : "pnpm exec wrangler deploy",
    cwd: config_file.project_dir,
    env: { CLOUDFLARE_ACCOUNT_ID: params.account_id },
  });
}

/**
 * 验证 Worker 健康状态。
 */
async function verifyWorker(state_file: CityProjectDeployStateFile): Promise<void> {
  const base_url = process.env.DOWNCITY_WORKER_URL
    ?? state_file.state.cloudflare?.worker_url;
  if (!base_url?.trim()) {
    emitCliBlock({
      tone: "warning",
      title: "Verification skipped",
      note: "Set DOWNCITY_WORKER_URL or .city/deploy.json cloudflare.worker_url to check /health.",
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
