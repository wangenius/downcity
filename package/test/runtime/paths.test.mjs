/**
 * Runtime Paths 测试（node:test）。
 *
 * 关键点（中文）
 * - 验证 Soul.md 默认路径与候选路径顺序稳定。
 * - 避免不同模块各自硬编码文件名，导致加载优先级漂移。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  SOUL_MD_FILE_CANDIDATES,
  getSoulMdPath,
  getSoulMdCandidatePaths,
} from "../../bin/main/runtime/Paths.js";

test("getSoulMdPath returns default Soul.md path", () => {
  const cwd = "/tmp/demo";
  assert.equal(getSoulMdPath(cwd), "/tmp/demo/Soul.md");
});

test("getSoulMdCandidatePaths keeps stable priority order", () => {
  assert.deepEqual(SOUL_MD_FILE_CANDIDATES, ["Soul.md", "soul.md", "SOUL.md"]);
  assert.deepEqual(getSoulMdCandidatePaths("/workspace"), [
    "/workspace/Soul.md",
    "/workspace/soul.md",
    "/workspace/SOUL.md",
  ]);
});
