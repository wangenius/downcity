/**
 * Cloudflare Workers 部署器。
 *
 * 关键点（中文）
 * - `city deploy` 的用户心智是“部署一个 City 项目”，不是配置 Cloudflare 工程。
 * - 构建和类型检查从 package.json 自动推断，`city.json` 保持最小。
 * - D1 等部署绑定写入项目 `.env`，Worker URL 回写到 City 自己的 server 配置。
 */

import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { addServer, readActiveServer, readServer } from "../../core/session.js";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { CliError } from "../../shared/CliError.js";
import type {
  FederationDeployOptions,
  FederationProjectConfigFile,
} from "../../types/FederationProjectConfig.js";
import {
  readFederationProjectDeployEnv,
  writeFederationProjectDeployEnv,
} from "../config/FederationProjectEnvLoader.js";
import { resolveCloudflareAccount } from "./CloudflareAccountResolver.js";
import { resolveD1Database } from "./D1DatabaseResolver.js";
import { writeWranglerConfig } from "./WranglerConfigWriter.js";
import { runCommand } from "./CommandRunner.js";
import { bumpProjectPatchVersion } from "./ProjectVersionManager.js";
import { runPackageDeployScripts } from "./PackageScriptRunner.js";

/**
 * 部署 Cloudflare Workers City 项目。
 */
export async function deployCloudflareWorkers(
  config_file: FederationProjectConfigFile,
  options: FederationDeployOptions,
): Promise<void> {
  let env_file = readFederationProjectDeployEnv(config_file.project_dir);

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
    await verifyWorker(readVerifyBaseUrl());
    return;
  }

  const account_result = await resolveCloudflareAccount({
    project_dir: config_file.project_dir,
    env_file,
    account_id: options.account_id,
  });
  const account_id = account_result.account_id;
  env_file = account_result.env_file;

  const version_bump =
    options.dry_run === true ? undefined : bumpProjectPatchVersion(config_file.project_dir);
  if (version_bump) {
    emitCliBlock({
      tone: "success",
      title: "Project version bumped",
      facts: [
        { label: "from", value: version_bump.previous_version },
        { label: "to", value: version_bump.next_version },
      ],
    });
  }

  await runPackageDeployScripts({
    project_dir: config_file.project_dir,
    skip_build: options.skip_build,
    skip_typecheck: options.skip_typecheck,
  });

  const d1_result = await resolveD1Database({
    config_file,
    env_file,
    account_id,
    create_if_missing: options.dry_run !== true,
  });
  env_file = d1_result.env_file;

  const wrangler_result = writeWranglerConfig(
    config_file,
    env_file,
    d1_result.resolved_database_id,
  );
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

  emitCliBlock({
    tone: "success",
    title: options.dry_run ? "Worker dry-run completed" : "Worker deployed",
    facts: [
      { label: "worker", value: config_file.config.name },
      ...(worker_url ? [{ label: "url", value: worker_url }] : []),
    ],
  });

  if (worker_url && !options.dry_run) {
    registerDeployedServer(config_file.config.name, worker_url);
  }

  if (options.verify && !options.dry_run) {
    await verifyWorker(worker_url ?? readVerifyBaseUrl());
  }
}

/**
 * 执行 Wrangler deploy。
 */
async function runWranglerDeploy(
  config_file: FederationProjectConfigFile,
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
async function verifyWorker(base_url: string | undefined): Promise<void> {
  if (!base_url?.trim()) {
    emitCliBlock({
      tone: "warning",
      title: "Verification skipped",
      note: "No connected City server found. Run `city deploy` first, or connect a City in the interactive CLI.",
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
 * 把部署出的 Worker 自动注册为当前 City server。
 */
function registerDeployedServer(name: string, worker_url: string): void {
  const existing_server = readServer(worker_url);
  const active_server = readActiveServer();
  const preserved_admin_secret_key = existing_server?.admin_secret_key
    ?? (active_server?.base_url === worker_url ? active_server.admin_secret_key : "")
    ?? "";

  addServer({
    name,
    base_url: worker_url,
    admin_secret_key: preserved_admin_secret_key,
  });

  emitCliBlock({
    tone: "success",
    title: "City server connected",
    facts: [
      { label: "name", value: name },
      { label: "url", value: worker_url },
    ],
    note: "The deployed Worker is now the active City server.",
  });
}

/**
 * 读取当前用于校验的 City server URL。
 */
function readVerifyBaseUrl(): string | undefined {
  return readActiveServer()?.base_url;
}

/**
 * shell 参数转义。
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
