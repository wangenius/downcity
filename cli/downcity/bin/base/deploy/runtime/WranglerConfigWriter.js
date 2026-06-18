/**
 * Wrangler 配置写入器。
 *
 * 关键点（中文）
 * - `federation.json` 是简单的 City 项目声明，Wrangler 配置是部署时临时生成物。
 * - Cloudflare 默认值由 CLI 管理，用户不需要在 `federation.json` 里写 worker_name 等细节。
 * - D1 database id 由 CLI 在部署时解析，不污染用户手写配置。
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
/**
 * 根据 City 项目配置和本地部署环境写入临时 wrangler.toml。
 */
export function writeWranglerConfig(config_file, env_file, database_id) {
    const config = config_file.config;
    const config_dir = mkdtempSync(join(tmpdir(), "downcity-wrangler-"));
    const config_path = join(config_dir, "wrangler.toml");
    const resolved_database_id = database_id ?? "";
    const lines = [
        `name = ${tomlString(config.name)}`,
        `main = ${tomlString(resolve(config_file.project_dir, config.entry))}`,
        `compatibility_date = ${tomlString("2025-05-12")}`,
        `compatibility_flags = ${tomlArray(["nodejs_compat"])}`,
        "workers_dev = true",
    ];
    if (config.database) {
        lines.push("", "[[d1_databases]]", `binding = ${tomlString(config.database.binding)}`, `database_name = ${tomlString(config.database.name)}`, `database_id = ${tomlString(resolved_database_id)}`);
    }
    lines.push("", "[observability]", "enabled = true");
    writeFileSync(config_path, `${lines.join("\n")}\n`);
    return { config_path };
}
/**
 * 渲染 TOML 字符串。
 */
function tomlString(value) {
    return JSON.stringify(value);
}
/**
 * 渲染 TOML 字符串数组。
 */
function tomlArray(values) {
    return `[${values.map(tomlString).join(", ")}]`;
}
//# sourceMappingURL=WranglerConfigWriter.js.map