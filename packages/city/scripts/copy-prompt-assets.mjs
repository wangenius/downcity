import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy txt assets required by runtime.
 *
 * 关键点（中文）
 * - `tsc` 不会复制 txt 资源文件，运行时又依赖这些文件，必须在 build 后补复制。
 * - 统一规则：复制 `src/` 下所有 `.txt` 文件到 `bin/` 对应相对路径。
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

const srcRoot = path.join(packageRoot, "src");
const txtFiles = await collectFiles({
  rootDir: srcRoot,
  matcher: (filePath) => filePath.endsWith(".txt"),
});
const copyJobs = txtFiles.map((srcPath) => {
  const relPath = path.relative(srcRoot, srcPath);
  return {
    srcPath,
    dstPath: path.join(packageRoot, "bin", relPath),
  };
});

if (copyJobs.length === 0) {
  console.log("[copy-prompt-assets] skip: no txt assets found under src/");
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
