/**
 * Downcity npm 发布矩阵解析脚本。
 *
 * 这个脚本给 GitHub Actions 使用：在 main push 之后列出所有
 * `packages/<package>` 下的 public npm 包，让每个发布任务独立检查
 * 当前版本是否已经存在于 npm registry。
 */

import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Actions 输出文件路径。
 */
const github_output_path = process.env.GITHUB_OUTPUT;

/**
 * 仓库里的 packages 目录。
 */
const packages_directory = join(process.cwd(), "packages");

/**
 * 列出所有可检测的 package.json 路径。
 *
 * @returns {string[]}
 */
function list_package_manifest_paths() {
  if (!existsSync(packages_directory)) {
    return [];
  }

  return readdirSync(packages_directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("packages", entry.name, "package.json"))
    .filter((manifest_path) => existsSync(join(process.cwd(), manifest_path)))
    .sort();
}

/**
 * 读取当前工作区中的 package.json。
 *
 * @param {string} manifest_path
 * @returns {{ name: string, version: string, private?: boolean }}
 */
function read_current_manifest(manifest_path) {
  return JSON.parse(readFileSync(join(process.cwd(), manifest_path), "utf8"));
}

/**
 * 把结果写入 GitHub Actions 输出。
 *
 * @param {string} key
 * @param {string} value
 */
function write_output(key, value) {
  if (!github_output_path) {
    return;
  }

  appendFileSync(github_output_path, `${key}=${value}\n`, "utf8");
}

const publish_candidates = [];

for (const manifest_path of list_package_manifest_paths()) {
  const current_manifest = read_current_manifest(manifest_path);

  if (current_manifest.private === true) {
    continue;
  }

  // scoped packages 发布流只负责 @downcity/*，CLI 包由独立 workflow 在依赖包发布成功后发布。
  if (!String(current_manifest.name ?? "").startsWith("@downcity/")) {
    continue;
  }

  if (!current_manifest.name || !current_manifest.version) {
    throw new Error(`${manifest_path} 缺少 name 或 version，无法参与发布判断。`);
  }

  // 关键点：矩阵包含所有 public 包，避免上一次发布失败后因为版本号未再次变化而无法补发。
  publish_candidates.push({
    name: current_manifest.name,
    path: dirname(manifest_path).replaceAll("\\", "/"),
    version: current_manifest.version,
  });
}

const matrix = {
  include: publish_candidates,
};

const has_packages = publish_candidates.length > 0 ? "true" : "false";

write_output("matrix", JSON.stringify(matrix));
write_output("has_packages", has_packages);

if (!github_output_path) {
  console.log(JSON.stringify({ matrix, has_packages }, null, 2));
}
