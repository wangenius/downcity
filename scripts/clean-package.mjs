/**
 * Package 构建产物跨平台清理脚本。
 *
 * 关键点（中文）
 * - 由各 package 在自身目录中调用，避免依赖 POSIX `rm`。
 * - 只删除固定的 `bin` 与 TypeScript 增量缓存，不接受外部路径参数。
 */

import fs from "node:fs/promises";
import path from "node:path";

const package_root = process.cwd();
await Promise.all([
  fs.rm(path.join(package_root, "bin"), { recursive: true, force: true }),
  fs.rm(path.join(package_root, "tsconfig.tsbuildinfo"), { force: true }),
]);
