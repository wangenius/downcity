import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy prompt txt assets required by runtime.
 *
 * 关键点（中文）
 * - `tsc` 不会复制 txt 资源文件，运行时又依赖这些文件，必须在 build 后补复制。
 * - 复制范围：
 *   1) `src/core/prompts/*.txt`
 *   2) `src/services` 目录下递归匹配文件名为 `PROMPT.txt` / `TASK.prompt.txt` 的文件
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "..");

/**
 * 递归收集匹配文件。
 */
async function collectFiles(params) {
  const { rootDir, matcher } = params;
  const out = [];
  if (!(await fs.pathExists(rootDir))) return out;

  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
        continue;
      }
      if (entry.isFile() && matcher(absPath)) {
        out.push(absPath);
      }
    }
  };

  await walk(rootDir);
  return out;
}

const copyJobs = [];

const corePromptDir = path.join(packageRoot, "src", "core", "prompts");
const corePromptFiles = await collectFiles({
  rootDir: corePromptDir,
  matcher: (filePath) =>
    path.dirname(filePath) === corePromptDir && filePath.endsWith(".txt"),
});
for (const srcPath of corePromptFiles) {
  const relPath = path.relative(path.join(packageRoot, "src"), srcPath);
  copyJobs.push({
    srcPath,
    dstPath: path.join(packageRoot, "bin", relPath),
  });
}

const servicesRoot = path.join(packageRoot, "src", "services");
const servicePromptFiles = await collectFiles({
  rootDir: servicesRoot,
  matcher: (filePath) =>
    path.basename(filePath) === "PROMPT.txt" ||
    path.basename(filePath) === "TASK.prompt.txt",
});
for (const srcPath of servicePromptFiles) {
  const relPath = path.relative(path.join(packageRoot, "src"), srcPath);
  copyJobs.push({
    srcPath,
    dstPath: path.join(packageRoot, "bin", relPath),
  });
}

if (copyJobs.length === 0) {
  console.log("[copy-prompt-assets] skip: no prompt txt assets found");
  process.exit(0);
}

for (const job of copyJobs) {
  await fs.ensureDir(path.dirname(job.dstPath));
  await fs.copy(job.srcPath, job.dstPath, {
    overwrite: true,
    dereference: true,
  });
}

console.log(
  "[copy-prompt-assets] copied " + String(copyJobs.length) + " file(s) to bin",
);
