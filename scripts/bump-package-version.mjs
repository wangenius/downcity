/**
 * @file downcity 构建版本号自增脚本入口。
 *
 * 关键点（中文）
 * - 供 shell 构建脚本直接调用，避免在 bash 中维护复杂的 JSON 处理逻辑。
 * - 真正的版本计算与写回逻辑放在可测试模块中。
 */

import { bumpPackagePatchVersion } from "./lib/bump-package-version.mjs";

const packageJsonPath = process.argv[2];

try {
  const result = bumpPackagePatchVersion(packageJsonPath);
  console.log(`Patched version: ${result.previousVersion} -> ${result.nextVersion}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
