import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * city import 边界检查。
 *
 * 规则（中文）
 * - city 包内禁止直接依赖 `@downcity/agent/*` 子路径。
 * - city 只能从 `@downcity/agent` 根入口消费 agent 公共能力。
 * - 这样可以把 agent 内部目录树继续视为实现细节，避免控制面反向耦合。
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(packageRoot, "src");

const IMPORT_RE =
  /(?:import\s+[^"'`]*?from\s*|export\s+[^"'`]*?from\s*|import\s*\()\s*["']([^"']+)["']/g;

async function collectTsFiles(dirPath) {
  const items = await fs.readdir(dirPath);
  const out = [];
  for (const name of items) {
    const abs = path.join(dirPath, name);
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) {
      out.push(...(await collectTsFiles(abs)));
      continue;
    }
    if (name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

function toPosix(inputPath) {
  return inputPath.split(path.sep).join("/");
}

async function run() {
  const files = await collectTsFiles(srcRoot);
  const violations = [];

  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf-8");
    const srcRelativeFilePath = toPosix(path.relative(srcRoot, filePath));

    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = String(match[1] || "").trim();
      if (!specifier.startsWith("@downcity/agent/")) continue;
      violations.push({
        file: srcRelativeFilePath,
        specifier,
        reason: "city 必须只从 @downcity/agent 根入口导入，禁止依赖 agent 内部子路径",
      });
    }
  }

  if (violations.length === 0) {
    console.log("✅ city import boundaries passed");
    return;
  }

  console.error(`❌ city import boundaries failed (${violations.length})`);
  for (const item of violations) {
    console.error(`- ${item.file}: ${item.specifier}`);
    console.error(`  ${item.reason}`);
  }
  process.exit(1);
}

await run();
