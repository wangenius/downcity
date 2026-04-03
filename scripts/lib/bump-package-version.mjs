/**
 * @file 提供 package.json patch 版本号自增能力。
 *
 * 关键点（中文）
 * - 仅处理 semver 的 major.minor.patch 主版本格式。
 * - 构建脚本与测试统一复用该模块，避免 shell 中重复维护版本解析逻辑。
 */

import fs from "node:fs";

/**
 * 将目标 package.json 的 patch 版本号加一。
 *
 * 关键点（中文）
 * - 只接受 `x.y.z` 或附带 prerelease/build metadata 的语义化版本。
 * - 返回变更前后的版本号，便于上层脚本输出日志。
 *
 * @param {string} packageJsonPath package.json 的绝对路径或相对路径。
 * @returns {{ previousVersion: string; nextVersion: string }} 版本变更结果。
 */
export function bumpPackagePatchVersion(packageJsonPath) {
  if (!packageJsonPath) {
    throw new Error("Missing package.json path");
  }

  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  const previousVersion = String(pkg.version || "");
  const match = previousVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);

  if (!match) {
    throw new Error(`Unsupported version format: ${previousVersion}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const nextVersion = `${major}.${minor}.${patch + 1}`;

  pkg.version = nextVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  return {
    previousVersion,
    nextVersion,
  };
}
