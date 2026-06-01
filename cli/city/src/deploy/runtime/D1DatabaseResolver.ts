/**
 * Cloudflare D1 数据库解析器。
 *
 * 关键点（中文）
 * - D1 是 Workers 目标的运行时资源，由 `city deploy` 自动准备。
 * - database id 写入 `.city/deploy.json`，不写回用户手写的 `city.json`。
 * - dry-run 不创建远程资源，只使用已有状态生成 Wrangler dry-run。
 */

import { emitCliBlock } from "../../shared/CliReporter.js";
import { CliError } from "../../shared/CliError.js";
import type {
  CityProjectConfigFile,
  CityProjectDeployStateFile,
} from "../../types/CityProjectConfig.js";
import {
  mergeCloudflareDeployState,
  writeCityProjectDeployState,
} from "../config/CityProjectDeployStateStore.js";
import { runCommand } from "./CommandRunner.js";

/** D1 解析参数。 */
export interface ResolveD1DatabaseParams {
  /** City 项目配置文件。 */
  config_file: CityProjectConfigFile;
  /** City 项目部署状态文件。 */
  state_file: CityProjectDeployStateFile;
  /** Cloudflare account id。 */
  account_id?: string;
}

/** D1 解析结果。 */
export interface ResolveD1DatabaseResult {
  /** 更新后的部署状态文件。 */
  state_file: CityProjectDeployStateFile;
  /** D1 database id。 */
  database_id?: string;
}

/**
 * 确认 D1 数据库存在，必要时创建并写入 `.city/deploy.json`。
 */
export async function resolveD1Database(
  params: ResolveD1DatabaseParams,
): Promise<ResolveD1DatabaseResult> {
  const database = params.config_file.config.database;
  if (!database) return { state_file: params.state_file };

  const existing_database_id = params.state_file.state.cloudflare?.database_id;
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
      state_file: params.state_file,
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
      fix: "Create D1 manually, then put cloudflare.database_id into .city/deploy.json.",
    });
  }

  const next_state_file = mergeCloudflareDeployState(params.state_file, {
    database_id,
  });
  writeCityProjectDeployState(next_state_file);

  emitCliBlock({
    tone: "success",
    title: "D1 database created",
    facts: [
      { label: "name", value: database.name },
      { label: "id", value: database_id },
      { label: "state", value: next_state_file.state_path },
    ],
  });

  return {
    state_file: next_state_file,
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
