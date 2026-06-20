/**
 * Cloudflare D1 数据库解析器。
 *
 * 关键点（中文）
 * - D1 是 Workers 目标的运行时资源，由 `city deploy` 自动准备。
 * - 用户只需要理解 database name；database id 由 CLI 在部署时自动解析。
 * - `.env` 只保存 database name 与 binding，不暴露内部 database id。
 * - dry-run 不创建远程资源，只使用已有 database name 解析临时 Wrangler 配置。
 */

import { emitCliBlock } from "@/shared/CliReporter.js";
import { CliError } from "@/shared/CliError.js";
import type {
  FederationProjectConfigFile,
  FederationProjectDeployEnvFile,
} from "@/federation/types/FederationProjectConfig.js";
import {
  writeFederationProjectDeployEnv,
} from "@/federation/deploy/config/FederationProjectEnvLoader.js";
import { runCommand } from "@/federation/deploy/runtime/CommandRunner.js";

/** D1 解析参数。 */
export interface ResolveD1DatabaseParams {
  /** City 项目配置文件。 */
  config_file: FederationProjectConfigFile;
  /** City 项目本地部署环境文件。 */
  env_file: FederationProjectDeployEnvFile;
  /** Cloudflare account id。 */
  account_id?: string;
  /** 找不到同名数据库时是否允许创建。 */
  create_if_missing?: boolean;
}

/** D1 解析结果。 */
export interface ResolveD1DatabaseResult {
  /** 更新后的本地部署环境文件。 */
  env_file: FederationProjectDeployEnvFile;
  /** 本次部署解析出的 D1 database id。 */
  resolved_database_id?: string;
}

/**
 * 确认 D1 数据库存在，必要时创建并写入项目 `.env`。
 */
export async function resolveD1Database(
  params: ResolveD1DatabaseParams,
): Promise<ResolveD1DatabaseResult> {
  const database = params.config_file.config.database;
  if (!database) return { env_file: params.env_file };
  const create_if_missing = params.create_if_missing !== false;

  emitCliBlock({
    tone: "warning",
    title: "Checking D1 database",
    facts: [{ label: "name", value: database.name }],
  });

  const listed_database_id = await findExistingD1DatabaseId({
    project_dir: params.config_file.project_dir,
    account_id: params.account_id,
    database_name: database.name,
  });
  if (listed_database_id) {
    const next_env_file = writeFederationProjectDeployEnv(params.env_file, {
      city_d1_database_name: database.name,
    });

    emitCliBlock({
      tone: "success",
      title: "D1 database reused",
      facts: [
        { label: "name", value: database.name },
        { label: "id", value: listed_database_id },
        { label: "env", value: next_env_file.env_path },
      ],
    });

    return {
      env_file: next_env_file,
      resolved_database_id: listed_database_id,
    };
  }

  if (!create_if_missing) {
    throw new CliError({
      title: "D1 database not found",
      note: `Cloudflare account does not have a D1 database named ${database.name}.`,
      fix: "Run `city deploy` once without `--dry-run` to let City create it, or create the D1 database manually and keep CITY_D1_DATABASE_NAME in the project .env.",
    });
  }

  emitCliBlock({
    tone: "warning",
    title: "Creating D1 database",
    facts: [{ label: "name", value: database.name }],
  });

  const output = await runCommand({
    label: "Create D1 database",
    command: `pnpm exec wrangler d1 create ${shellQuote(database.name)}`,
    cwd: params.config_file.project_dir,
    env: { CLOUDFLARE_ACCOUNT_ID: params.account_id },
    capture: true,
  });
  const database_id = extractD1DatabaseId(output);
  if (!database_id) {
    throw new CliError({
      title: "Unable to read D1 database id",
      note: output,
      fix: "Create D1 manually in Cloudflare or keep CITY_D1_DATABASE_NAME set, then rerun city deploy.",
    });
  }

  const next_env_file = writeFederationProjectDeployEnv(params.env_file, {
    city_d1_database_name: database.name,
  });

  emitCliBlock({
    tone: "success",
    title: "D1 database created",
    facts: [
      { label: "name", value: database.name },
      { label: "id", value: database_id },
      { label: "env", value: next_env_file.env_path },
    ],
  });

  return {
    env_file: next_env_file,
    resolved_database_id: database_id,
  };
}

/**
 * 从 Wrangler 输出中提取 UUID。
 */
function extractD1DatabaseId(output: string): string | undefined {
  return output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
}

/**
 * 从 Cloudflare 已有 D1 列表中查找同名数据库。
 */
async function findExistingD1DatabaseId(
  params: {
    project_dir: string;
    account_id?: string;
    database_name: string;
  },
): Promise<string | undefined> {
  const output = await runCommand({
    label: "List D1 databases",
    command: "pnpm exec wrangler d1 list --json",
    cwd: params.project_dir,
    env: { CLOUDFLARE_ACCOUNT_ID: params.account_id },
    capture: true,
  });

  try {
    const parsed = JSON.parse(output) as Array<{ name?: unknown; uuid?: unknown }>;
    const matched = parsed.find((item) => String(item?.name ?? "").trim() === params.database_name);
    const database_id = String(matched?.uuid ?? "").trim();
    return database_id || undefined;
  } catch {
    return undefined;
  }
}

/**
 * shell 参数转义。
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
