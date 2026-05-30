/**
 * downcity 聚合包产物复制脚本。
 *
 * 关键点（中文）
 * - `downcity` 是唯一对外安装包，不能依赖内部 CLI workspace 包名。
 * - 构建时把 `cli/city/bin`、`cli/studio/bin` 与 Console 静态资源复制进本包。
 * - 复制后的目录布局要匹配编译产物里的相对路径读取逻辑。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const package_root = path.resolve(__dirname, "..");
const workspace_root = path.resolve(package_root, "../..");

const copy_targets = [
  {
    label: "city runtime",
    source_path: path.join(workspace_root, "cli/city/bin"),
    target_path: path.join(package_root, "city-cli"),
  },
  {
    label: "studio runtime",
    source_path: path.join(workspace_root, "cli/studio/bin"),
    target_path: path.join(package_root, "studio-cli"),
  },
  {
    label: "console assets",
    source_path: path.join(workspace_root, "cli/city/public"),
    target_path: path.join(package_root, "public"),
  },
];

async function assert_source_exists(source_path, label) {
  try {
    await fs.access(source_path);
  } catch {
    throw new Error(
      [
        `${label} not found: ${source_path}`,
        "Run `pnpm -C cli/city build` and `pnpm -C cli/studio build` first.",
      ].join(" "),
    );
  }
}

for (const item of copy_targets) {
  await assert_source_exists(item.source_path, item.label);
  await fs.rm(item.target_path, { recursive: true, force: true });
  await fs.cp(item.source_path, item.target_path, { recursive: true });
  console.log(`[copy-cli-products] copied ${item.label}`);
}
