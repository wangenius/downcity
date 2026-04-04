import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 确保 CLI 入口产物具有可执行权限。
 *
 * 关键点（中文）
 * - `npm link` / `npm install -g` 暴露的 bin 最终会指向 `bin/city/modules/cli/Index.js`。
 * - 如果该文件没有执行位，即使存在 shebang，shell 仍可能无法直接执行 `city` / `downcity`。
 * - 因此在 build / prepack 之后显式补一次 chmod，保证发布产物天然可执行。
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const cliEntryPath = path.join(packageRoot, "bin/city/modules/cli/Index.js");

try {
  const stats = await fs.stat(cliEntryPath);
  const nextMode = stats.mode | 0o755;
  await fs.chmod(cliEntryPath, nextMode);
  console.log(`[ensure-cli-executable] chmod +x ${cliEntryPath}`);
} catch (error) {
  console.error(
    `[ensure-cli-executable] failed for ${cliEntryPath}: ${String(error)}`,
  );
  process.exit(1);
}
