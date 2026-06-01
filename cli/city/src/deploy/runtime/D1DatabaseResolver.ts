/**
 * Cloudflare D1 数据库解析器。
 *
 * 关键点（中文）
 * - D1 是 Workers 目标的运行时资源，由 `city deploy` 自动准备。
 * - database id 写入项目 `.env`，不写回用户手写的 `city.json`。
 * - dry-run 不创建远程资源，只使用已有 `.env` 生成 Wrangler dry-run。
 */

import { emitCliBlock } from "../../shared/CliReporter.js";
import { CliError } from "../../shared/CliError.js";
import type {
  CityProjectConfigFile,
  CityProjectDeployEnvFile,
} from "../../types/CityProjectConfig.js";
import {
  writeCityProjectDeployEnv,
} from "../config/CityProjectEnvLoader.js";
import { runCommand } from "./CommandRunner.js";

/** D1 解析参数。 */
export interface ResolveD1DatabaseParams {
  /** City 项目配置文件。 */
  config_file: CityProjectConfigFile;
  /** City 项目本地部署环境文件。 */
  env_file: CityProjectDeployEnvFile;
  /** Cloudflare account id。 */
  account_id?: string;
}

/** D1 解析结果。 */
export interface ResolveD1DatabaseResult {
  /** 更新后的本地部署环境文件。 */
  env_file: CityProjectDeployEnvFile;
  /** D1 database id。 */
  database_id?: string;
}

/**
 * 确认 D1 数据库存在，必要时创建并写入项目 `.env`。
 */
export async function resolveD1Database(
  params: ResolveD1DatabaseParams,
): Promise<ResolveD1DatabaseResult> {
  const database = params.config_file.config.database;
  if (!database) return { env_file: params.env_file };

  const existing_database_id = params.env_file.env.city_d1_database_id;
  if (existing_database_id) {
    emitCliBlock({
      tone: "success",
      title: "D1 database ready",
      facts: [
        { label: "name", value: database.name },
        { label: "id", value: existing_database_id },
      ],
    });
    return {
      env_file: params.env_file,
      database_id: existing_database_id,
    };
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
      fix: "Create D1 manually, then put CITY_D1_DATABASE_ID into the project .env.",
    });
  }

  const next_env_file = writeCityProjectDeployEnv(params.env_file, {
    city_d1_database_id: database_id,
    city_d1_database_name: database.name,
    city_d1_binding: database.binding,
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
    database_id,
  };
}

/**
 * 从 Wrangler 输出中提取 UUID。
 */
function extractD1DatabaseId(output: string): string | undefined {
  return output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
}

/**
 * shell 参数转义。
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
