/**
 * Cloudflare Workers 部署器。
 *
 * 关键点（中文）
 * - `city deploy` 的用户心智是“部署一个 City 项目”，不是配置 Cloudflare 工程。
 * - 构建和类型检查从 package.json 自动推断，稳定资源由 `federation.json` 声明。
 * - D1 database id 与 Worker URL 都是部署状态，不写入项目配置。
 */

import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { addServer, readActiveServer, readServer } from "@/federation/core/session.js";
import { emitCliBlock } from "@/shared/CliReporter.js";
import { CliError } from "@/shared/CliError.js";
import type {
  FederationDeployOptions,
  FederationProjectConfigFile,
} from "@/federation/types/FederationProjectConfig.js";
import type {
  FederationPackageScriptResult,
} from "@/federation/types/FederationDeployRuntime.js";
import { resolveCloudflareAccount } from "@/federation/deploy/runtime/CloudflareAccountResolver.js";
import { resolveD1Database } from "@/federation/deploy/runtime/D1DatabaseResolver.js";
import { resolveQueue } from "@/federation/deploy/runtime/QueueResolver.js";
import { resolveR2Bucket } from "@/federation/deploy/runtime/R2BucketResolver.js";
import { writeWranglerConfig } from "@/federation/deploy/runtime/WranglerConfigWriter.js";
import { runCommand } from "@/federation/deploy/runtime/CommandRunner.js";
import { bumpProjectPatchVersion } from "@/federation/deploy/runtime/ProjectVersionManager.js";
import { runPackageDeployScripts } from "@/federation/deploy/runtime/PackageScriptRunner.js";

/**
 * 部署 Cloudflare Workers City 项目。
 */
export async function deployCloudflareWorkers(
  config_file: FederationProjectConfigFile,
  options: FederationDeployOptions,
): Promise<void> {
  emitCliBlock({
    tone: "accent",
    title: "Project",
    facts: [
      { label: "name", value: config_file.config.name },
      { label: "target", value: config_file.config.target },
      { label: "source", value: config_file.project_dir },
    ],
  });

  if (options.verify_only) {
    await verifyWorker(readVerifyBaseUrl());
    return;
  }

  const account_result = await resolveCloudflareAccount({
    project_dir: config_file.project_dir,
    account_id: options.account_id,
  });
  const account_id = account_result.account_id;

  const version_bump =
    options.dry_run === true ? undefined : bumpProjectPatchVersion(config_file.project_dir);
  if (version_bump) {
    emitCliBlock({
      tone: "success",
      title: "Version",
      facts: [
        { label: "from", value: version_bump.previous_version },
        { label: "to", value: version_bump.next_version },
      ],
    });
  }

  const scripts_result = await runPackageDeployScripts({
    project_dir: config_file.project_dir,
    skip_build: options.skip_build,
    skip_typecheck: options.skip_typecheck,
  });
  emitPackageScriptSummary("Build", scripts_result.build);
  emitPackageScriptSummary("Typecheck", scripts_result.typecheck);

  const d1_result = await resolveD1Database({
    config_file,
    account_id,
    create_if_missing: options.dry_run !== true,
  });
  const queue_result = await resolveQueue({
    config_file,
    account_id,
    create_if_missing: options.dry_run !== true,
  });
  const storage_result = await resolveR2Bucket({
    config_file,
    account_id,
    create_if_missing: options.dry_run !== true,
  });

  const wrangler_result = writeWranglerConfig(
    config_file,
    d1_result.resolved_database_id,
  );
  emitCliBlock({
    tone: "success",
    title: "D1 Database",
    facts: [
      { label: "name", value: d1_result.summary.name ?? "(none)" },
      { label: "id", value: d1_result.summary.id ?? "(none)" },
      { label: "status", value: d1_result.summary.status },
    ],
  });
  emitCliBlock({
    tone: "success",
    title: "Queue",
    facts: [
      { label: "name", value: queue_result.summary.name ?? "(none)" },
      { label: "status", value: queue_result.summary.status },
    ],
  });
  emitCliBlock({
    tone: "success",
    title: "Storage",
    facts: [
      { label: "type", value: storage_result.summary.type ?? "(none)" },
      { label: "name", value: storage_result.summary.name ?? "(none)" },
      { label: "status", value: storage_result.summary.status },
    ],
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
    title: "Wrangler",
    facts: [
      { label: "config", value: wrangler_result.config_path },
      { label: "status", value: options.dry_run ? "dry-run" : "deployed" },
    ],
  });

  emitCliBlock({
    tone: "success",
    title: "Deployment",
    facts: [
      { label: "worker", value: config_file.config.name },
      ...(worker_url ? [{ label: "url", value: worker_url }] : []),
      { label: "status", value: options.dry_run ? "dry-run" : "success" },
    ],
  });

  if (worker_url && !options.dry_run) {
    const active_server = registerDeployedServer(config_file.config.name, worker_url);
    emitCliBlock({
      tone: "success",
      title: "Active Server",
      facts: [
        { label: "name", value: active_server.name },
        { label: "url", value: active_server.url },
        { label: "status", value: "connected" },
      ],
    });
  } else {
    emitCliBlock({
      tone: "info",
      title: "Active Server",
      facts: [
        { label: "name", value: config_file.config.name },
        ...(worker_url ? [{ label: "url", value: worker_url }] : []),
        { label: "status", value: "skipped" },
      ],
    });
  }

  if (options.verify && !options.dry_run) {
    await verifyWorker(worker_url ?? readVerifyBaseUrl());
  }
}

/**
 * 输出 package script 执行摘要。
 */
function emitPackageScriptSummary(
  title: "Build" | "Typecheck",
  result: FederationPackageScriptResult,
): void {
  emitCliBlock({
    tone: result.status === "passed" ? "success" : "info",
    title,
    facts: [
      { label: "command", value: result.command },
      { label: "status", value: result.status },
    ],
  });
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
function registerDeployedServer(name: string, worker_url: string): { name: string; url: string } {
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
  return {
    name,
    url: worker_url,
  };
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
