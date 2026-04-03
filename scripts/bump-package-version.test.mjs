/**
 * @file 验证 downcity 构建版本号自增逻辑。
 *
 * 关键点（中文）
 * - 只校验 patch 自增，不引入真实构建流程。
 * - 通过临时 package.json 避免污染仓库内真实版本文件。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { bumpPackagePatchVersion } from "./lib/bump-package-version.mjs";

test("bumpPackagePatchVersion should patch the package version by one", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-build-version-"));
  const packageJsonPath = path.join(tempDir, "package.json");

  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(
      {
        name: "downcity",
        version: "1.2.3",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const result = bumpPackagePatchVersion(packageJsonPath);
  const updatedPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  assert.deepEqual(result, {
    previousVersion: "1.2.3",
    nextVersion: "1.2.4",
  });
  assert.equal(updatedPackage.version, "1.2.4");
});
