/**
 * Downcity npm 发布矩阵解析脚本。
 *
 * 这个脚本给 GitHub Actions 使用：在 main push 之后比较
 * `packages/<package>/package.json` 的版本号，只把真正发生版本变化的
 * public npm 包加入发布矩阵。
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * GitHub 在首次 push 或特殊场景下会把 before 置成全 0 SHA。
 * 遇到这种情况时，我们把所有可发布包都视为“新版本待发布”。
 */
const ZERO_SHA = "0".repeat(40);

/**
 * 当前 push 之前的提交 SHA。
 */
const before_ref = (process.env.GITHUB_EVENT_BEFORE ?? "").trim();

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
 * 读取某个历史提交中的 package.json。
 *
 * 如果该文件在旧提交里不存在，说明这是新包，直接返回 null。
 *
 * @param {string} ref
 * @param {string} manifest_path
 * @returns {{ name: string, version: string, private?: boolean } | null}
 */
function read_manifest_at_ref(ref, manifest_path) {
  if (!ref || ref === ZERO_SHA) {
    return null;
  }

  try {
    const content = execFileSync(
      "git",
      ["show", `${ref}:${manifest_path.replaceAll("\\", "/")}`],
      { encoding: "utf8" },
    );

    return JSON.parse(content);
  } catch {
    return null;
  }
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

const changed_packages = [];

for (const manifest_path of list_package_manifest_paths()) {
  const current_manifest = read_current_manifest(manifest_path);

  if (current_manifest.private === true) {
    continue;
  }

  if (!current_manifest.name || !current_manifest.version) {
    throw new Error(`${manifest_path} 缺少 name 或 version，无法参与发布判断。`);
  }

  const previous_manifest = read_manifest_at_ref(before_ref, manifest_path);
  const previous_version = previous_manifest?.version ?? null;
  const current_version = current_manifest.version;

  // 只有版本号实际变化时，才进入发布矩阵。
  if (previous_version === current_version) {
    continue;
  }

  changed_packages.push({
    name: current_manifest.name,
    path: dirname(manifest_path).replaceAll("\\", "/"),
    version: current_version,
  });
}

const matrix = {
  include: changed_packages,
};

const has_packages = changed_packages.length > 0 ? "true" : "false";

write_output("matrix", JSON.stringify(matrix));
write_output("has_packages", has_packages);

if (!github_output_path) {
  console.log(JSON.stringify({ matrix, has_packages }, null, 2));
}
