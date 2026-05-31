/**
 * bay CLI 入口校验脚本。
 *
 * 关键点（中文）
 * - bay 包独立编译 TypeScript。
 * - typecheck 阶段确认编译入口存在，避免发布空壳包。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const entry_path = path.resolve(__dirname, "../bin/index.js");

await fs.access(entry_path);
console.log(`[verify-entry] found ${entry_path}`);
