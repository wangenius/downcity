/**
 * City 项目本地部署环境文件。
 *
 * 关键点（中文）
 * - `city deploy` 默认读取目标目录下的 `.env`，方便本地显式部署。
 * - `.env` 只保存 City 项目自身真正需要的部署输入，例如 D1 name。
 * - Provider key、Stripe key 等业务密钥仍应写入 City env 表，而不是写入公开客户端。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
const DEPLOY_ENV_KEYS = [
    "CITY_D1_DATABASE_NAME",
];
/**
 * 加载 City 项目目录下的 `.env`。
 */
export function loadCityProjectEnv(project_dir) {
    const env_path = join(project_dir, ".env");
    if (!existsSync(env_path))
        return;
    config({ path: env_path, override: false });
}
/**
 * 读取 City 项目的本地部署环境。
 */
export function readCityProjectDeployEnv(project_dir) {
    const env_path = join(project_dir, ".env");
    const file_env = existsSync(env_path)
        ? parseEnvFile(readFileSync(env_path, "utf-8"))
        : {};
    return {
        env_path,
        env: normalizeDeployEnv({
            city_d1_database_name: file_env.CITY_D1_DATABASE_NAME ?? process.env.CITY_D1_DATABASE_NAME,
        }),
    };
}
/**
 * 合并并写入 City 项目的本地部署环境。
 */
export function writeCityProjectDeployEnv(env_file, next_env) {
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
function normalizeDeployEnv(input) {
    return {
        city_d1_database_name: clean(input.city_d1_database_name),
    };
}
/**
 * 渲染部署环境变量。
 */
function renderDeployEnv(env) {
    const values = {};
    if (env.city_d1_database_name)
        values.CITY_D1_DATABASE_NAME = env.city_d1_database_name;
    return values;
}
/**
 * 更新 env 文本中的部署键。
 */
function upsertEnvValues(text, values) {
    const lines = text.split(/\r?\n/);
    const seen = new Set();
    const next_lines = lines.map((line) => {
        const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
        if (!key || !(key in values))
            return line;
        seen.add(key);
        return `${key}=${quoteEnvValue(values[key] ?? "")}`;
    });
    const missing_keys = DEPLOY_ENV_KEYS.filter((key) => key in values && !seen.has(key));
    if (missing_keys.length > 0) {
        const has_content = next_lines.some((line) => line.trim());
        if (has_content && next_lines[next_lines.length - 1]?.trim())
            next_lines.push("");
        if (!next_lines.includes("# City deploy"))
            next_lines.push("# City deploy");
        for (const key of missing_keys) {
            next_lines.push(`${key}=${quoteEnvValue(values[key] ?? "")}`);
        }
    }
    const filtered_lines = next_lines.filter((line) => (!line.match(/^\s*CITY_D1_DATABASE_ID\s*=/)
        && !line.match(/^\s*CITY_WORKER_URL\s*=/)
        && !line.match(/^\s*DOWNCITY_WORKER_URL\s*=/)
        && !line.match(/^\s*CITY_TARGET\s*=/)
        && !line.match(/^\s*CLOUDFLARE_ACCOUNT_ID\s*=/)
        && !line.match(/^\s*CITY_D1_BINDING\s*=/)));
    return `${filtered_lines.join("\n").replace(/\n+$/, "")}\n`;
}
/**
 * 解析简单 env 文件。
 */
function parseEnvFile(text) {
    const result = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match)
            continue;
        result[match[1] ?? ""] = unquoteEnvValue(match[2] ?? "");
    }
    return result;
}
/**
 * 渲染 env value。
 */
function quoteEnvValue(value) {
    if (/^[A-Za-z0-9_./:@-]*$/.test(value))
        return value;
    return JSON.stringify(value);
}
/**
 * 读取 env value。
 */
function unquoteEnvValue(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
/**
 * 清理可选字符串。
 */
function clean(value) {
    const trimmed = String(value ?? "").trim();
    return trimmed || undefined;
}
/**
 * 取文件目录，避免额外引入 dirname 命名冲突。
 */
function projectDirname(file_path) {
    return file_path.replace(/[/\\][^/\\]+$/, "");
}
//# sourceMappingURL=CityProjectEnvLoader.js.map