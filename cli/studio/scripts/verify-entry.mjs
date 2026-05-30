/**
 * studio CLI 入口校验脚本。
 *
 * 关键点（中文）
 * - studio 包暂时不单独编译 TypeScript。
 * - typecheck 阶段确认转发入口存在，避免发布空壳包。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const entry_path = path.resolve(__dirname, "../bin/studio/index.js");

await fs.access(entry_path);
console.log(`[verify-entry] found ${entry_path}`);
