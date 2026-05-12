import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const cliEntryPath = path.join(packageRoot, "bin/cli/Index.js");

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
