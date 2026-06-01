/**
 * City 项目本地部署环境文件。
 *
 * 关键点（中文）
 * - `city deploy` 默认读取目标目录下的 `.env`，方便本地显式部署。
 * - `.env` 保存部署绑定信息，例如 Cloudflare account、D1 id 和 Worker URL。
 * - Provider key、Stripe key 等业务密钥仍应写入 City env 表，而不是写入公开客户端。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import type {
  CityProjectDeployEnv,
  CityProjectDeployEnvFile,
} from "../../types/CityProjectConfig.js";

const DEPLOY_ENV_KEYS = [
  "CITY_TARGET",
  "CLOUDFLARE_ACCOUNT_ID",
  "CITY_WORKER_URL",
  "DOWNCITY_WORKER_URL",
  "CITY_D1_DATABASE_ID",
  "CITY_D1_DATABASE_NAME",
  "CITY_D1_BINDING",
] as const;

/**
 * 加载 City 项目目录下的 `.env`。
 */
export function loadCityProjectEnv(project_dir: string): void {
  const env_path = join(project_dir, ".env");
  if (!existsSync(env_path)) return;
  config({ path: env_path, override: false });
}

/**
 * 读取 City 项目的本地部署环境。
 */
export function readCityProjectDeployEnv(project_dir: string): CityProjectDeployEnvFile {
  const env_path = join(project_dir, ".env");
  const file_env = existsSync(env_path)
    ? parseEnvFile(readFileSync(env_path, "utf-8"))
    : {};
  return {
    env_path,
    env: normalizeDeployEnv({
      cloudflare_account_id: file_env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID,
      city_worker_url: file_env.CITY_WORKER_URL
        ?? file_env.DOWNCITY_WORKER_URL
        ?? process.env.CITY_WORKER_URL
        ?? process.env.DOWNCITY_WORKER_URL,
      city_d1_database_id: file_env.CITY_D1_DATABASE_ID ?? process.env.CITY_D1_DATABASE_ID,
      city_d1_database_name: file_env.CITY_D1_DATABASE_NAME ?? process.env.CITY_D1_DATABASE_NAME,
      city_d1_binding: file_env.CITY_D1_BINDING ?? process.env.CITY_D1_BINDING,
    }),
  };
}

/**
 * 合并并写入 City 项目的本地部署环境。
 */
export function writeCityProjectDeployEnv(
  env_file: CityProjectDeployEnvFile,
  next_env: Partial<CityProjectDeployEnv>,
): CityProjectDeployEnvFile {
  const merged_env = normalizeDeployEnv({
    ...env_file.env,
    ...next_env,
  });
  const current_text = existsSync(env_file.env_path)
    ? readFileSync(env_file.env_path, "utf-8")
    : "";
  const next_text = upsertEnvValues(current_text, renderDeployEnv(merged_env));
  mkdirSync(projectDirname(env_file.env_path), { recursive: true });
  writeFileSync(env_file.env_path, next_text);
  for (const [key, value] of Object.entries(renderDeployEnv(merged_env))) {
    process.env[key] = value;
  }
  return {
    env_path: env_file.env_path,
    env: merged_env,
  };
}

/**
 * 规范化部署环境。
 */
function normalizeDeployEnv(input: Partial<CityProjectDeployEnv>): CityProjectDeployEnv {
  return {
    cloudflare_account_id: clean(input.cloudflare_account_id),
    city_worker_url: clean(input.city_worker_url),
    city_d1_database_id: clean(input.city_d1_database_id),
    city_d1_database_name: clean(input.city_d1_database_name),
    city_d1_binding: clean(input.city_d1_binding),
  };
}

/**
 * 渲染部署环境变量。
 */
function renderDeployEnv(env: CityProjectDeployEnv): Record<string, string> {
  const values: Record<string, string> = {
    CITY_TARGET: "cloudflare-workers",
  };
  if (env.cloudflare_account_id) values.CLOUDFLARE_ACCOUNT_ID = env.cloudflare_account_id;
  if (env.city_worker_url) {
    values.CITY_WORKER_URL = env.city_worker_url;
    values.DOWNCITY_WORKER_URL = env.city_worker_url;
  }
  if (env.city_d1_database_id) values.CITY_D1_DATABASE_ID = env.city_d1_database_id;
  if (env.city_d1_database_name) values.CITY_D1_DATABASE_NAME = env.city_d1_database_name;
  if (env.city_d1_binding) values.CITY_D1_BINDING = env.city_d1_binding;
  return values;
}

/**
 * 更新 env 文本中的部署键。
 */
function upsertEnvValues(text: string, values: Record<string, string>): string {
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const next_lines = lines.map((line) => {
    const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!key || !(key in values)) return line;
    seen.add(key);
    return `${key}=${quoteEnvValue(values[key] ?? "")}`;
  });

  const missing_keys = DEPLOY_ENV_KEYS.filter((key) => key in values && !seen.has(key));
  if (missing_keys.length > 0) {
    const has_content = next_lines.some((line) => line.trim());
    if (has_content && next_lines[next_lines.length - 1]?.trim()) next_lines.push("");
    if (!next_lines.includes("# City deploy")) next_lines.push("# City deploy");
    for (const key of missing_keys) {
      next_lines.push(`${key}=${quoteEnvValue(values[key] ?? "")}`);
    }
  }

  return `${next_lines.join("\n").replace(/\n+$/, "")}\n`;
}

/**
 * 解析简单 env 文件。
 */
function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    result[match[1] ?? ""] = unquoteEnvValue(match[2] ?? "");
  }
  return result;
}

/**
 * 渲染 env value。
 */
function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]*$/.test(value)) return value;
  return JSON.stringify(value);
}

/**
 * 读取 env value。
 */
function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * 清理可选字符串。
 */
function clean(value: string | undefined): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

/**
 * 取文件目录，避免额外引入 dirname 命名冲突。
 */
function projectDirname(file_path: string): string {
  return file_path.replace(/[/\\][^/\\]+$/, "");
}
