/**
 * town CLI 构建后入口权限修复脚本。
 *
 * 关键点（中文）
 * - 当前 town 包是独立构建单元。
 * - 构建阶段保证 `bin/index.js` 具备可执行权限。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const package_root = path.resolve(__dirname, "..");
const cli_entry_path = path.join(package_root, "bin/index.js");

const stats = await fs.stat(cli_entry_path);
await fs.chmod(cli_entry_path, stats.mode | 0o755);
console.log(`[ensure-cli-executable] chmod +x ${cli_entry_path}`);
