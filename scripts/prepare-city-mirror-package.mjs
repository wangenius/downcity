#!/usr/bin/env node

/**
 * @file 基于 @downcity/city 的打包产物生成 downcity 镜像包。
 *
 * 关键点（中文）
 * - 只维护 `packages/city` 一份源码，避免双 package 源码漂移。
 * - 先对 `packages/city` 执行 `pnpm pack`，确保镜像包复用真实发布产物。
 * - 仅在临时目录中覆写 package name，再重新打包成 `downcity` tarball。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const CITY_PACKAGE_DIR = path.join(ROOT_DIR, "packages/city");
const MIRROR_PACKAGE_NAME = "downcity";

/**
 * 查找目录中的首个 tgz 文件。
 */
function findTarball(targetDir) {
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const tarball = entries.find((entry) => entry.isFile() && entry.name.endsWith(".tgz"));
  if (!tarball) {
    throw new Error(`No tarball generated under ${targetDir}`);
  }
  return path.join(targetDir, tarball.name);
}

/**
 * 读取并校验镜像包需要的 package.json。
 */
function readPackedPackageJson(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw);
  const version = typeof parsed.version === "string" ? parsed.version.trim() : "";
  if (!version) {
    throw new Error("Packed city package is missing version");
  }
  return { packageJsonPath, parsed, version };
}

/**
 * 生成 downcity 镜像 tarball。
 */
function main() {
  const outputDir = path.resolve(process.argv[2] || path.join(ROOT_DIR, ".tmp/npm"));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-city-mirror-"));
  const packDir = path.join(tempRoot, "pack");
  const unpackDir = path.join(tempRoot, "unpack");

  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(unpackDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    // 先复用官方 city 发布 tarball，确保镜像内容与正式包一致。
    execFileSync("pnpm", ["-C", CITY_PACKAGE_DIR, "pack", "--pack-destination", packDir], {
      stdio: ["ignore", "ignore", "inherit"],
    });

    const sourceTarball = findTarball(packDir);
    execFileSync("tar", ["-xzf", sourceTarball, "-C", unpackDir], {
      stdio: ["ignore", "ignore", "inherit"],
    });

    const packedPackageDir = path.join(unpackDir, "package");
    const { packageJsonPath, parsed, version } = readPackedPackageJson(packedPackageDir);
    parsed.name = MIRROR_PACKAGE_NAME;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    const mirrorTarballPath = path.join(outputDir, `${MIRROR_PACKAGE_NAME}-${version}.tgz`);
    execFileSync("tar", ["-czf", mirrorTarballPath, "-C", unpackDir, "package"], {
      stdio: ["ignore", "ignore", "inherit"],
    });

    process.stdout.write(mirrorTarballPath);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();
