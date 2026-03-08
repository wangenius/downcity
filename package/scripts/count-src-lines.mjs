import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 统计 package/src 下代码文件的行数。
 *
 * 关键点（中文）
 * - 仅统计常见代码扩展名，避免把 README、PROMPT 等文本资源计入代码行。
 * - 同时输出总行数与非空行数，便于快速评估代码规模。
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(packageRoot, "src");

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

/**
 * 判断是否为代码文件。
 */
function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * 递归收集目录中的代码文件。
 */
async function collectCodeFiles(dirPath) {
  const out = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectCodeFiles(absPath)));
      continue;
    }
    if (entry.isFile() && isCodeFile(absPath)) {
      out.push(absPath);
    }
  }
  return out;
}

/**
 * 统计单文件总行数与非空行数。
 */
function countFileLines(fileContent) {
  const normalized = fileContent.replace(/\r\n/g, "\n");
  if (normalized.length === 0) {
    return { totalLines: 0, nonEmptyLines: 0 };
  }

  const lines = normalized.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0).length;
  return {
    totalLines: lines.length,
    nonEmptyLines,
  };
}

async function run() {
  const exists = await fs.pathExists(srcRoot);
  if (!exists) {
    console.error(`[count-src-lines] directory not found: ${srcRoot}`);
    process.exit(1);
  }

  const files = await collectCodeFiles(srcRoot);

  let totalLines = 0;
  let nonEmptyLines = 0;
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf-8");
    const counts = countFileLines(content);
    totalLines += counts.totalLines;
    nonEmptyLines += counts.nonEmptyLines;
  }

  console.log("package/src 代码统计");
  console.log(`文件数: ${files.length}`);
  console.log(`总行数: ${totalLines}`);
  console.log(`非空行数: ${nonEmptyLines}`);
}

await run();
