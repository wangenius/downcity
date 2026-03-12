/**
 * Runtime Paths 测试（node:test）。
 *
 * 关键点（中文）
 * - 验证 PROFILE.md 默认路径与候选路径顺序稳定。
 * - 验证 SOUL.md 默认路径与候选路径顺序稳定。
 * - 验证 USER.md 默认路径与候选路径顺序稳定。
 * - 避免不同模块各自硬编码文件名，导致加载优先级漂移。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  PROFILE_MD_FILE_CANDIDATES,
  SOUL_MD_FILE_CANDIDATES,
  USER_MD_FILE_CANDIDATES,
  getProfileMdPath,
  getProfileMdCandidatePaths,
  getSoulMdPath,
  getSoulMdCandidatePaths,
  getUserMdPath,
  getUserMdCandidatePaths,
} from "../../bin/console/env/Paths.js";

test("getProfileMdPath returns default PROFILE.md path", () => {
  const cwd = "/tmp/demo";
  assert.equal(getProfileMdPath(cwd), "/tmp/demo/PROFILE.md");
});

test("getProfileMdCandidatePaths keeps stable priority order", () => {
  assert.deepEqual(PROFILE_MD_FILE_CANDIDATES, ["PROFILE.md"]);
  assert.deepEqual(getProfileMdCandidatePaths("/workspace"), [
    "/workspace/PROFILE.md",
  ]);
});

test("getSoulMdPath returns default SOUL.md path", () => {
  const cwd = "/tmp/demo";
  assert.equal(getSoulMdPath(cwd), "/tmp/demo/SOUL.md");
});

test("getSoulMdCandidatePaths keeps stable priority order", () => {
  assert.deepEqual(SOUL_MD_FILE_CANDIDATES, ["SOUL.md"]);
  assert.deepEqual(getSoulMdCandidatePaths("/workspace"), [
    "/workspace/SOUL.md",
  ]);
});

test("getUserMdPath returns default USER.md path", () => {
  const cwd = "/tmp/demo";
  assert.equal(getUserMdPath(cwd), "/tmp/demo/USER.md");
});

test("getUserMdCandidatePaths keeps stable priority order", () => {
  assert.deepEqual(USER_MD_FILE_CANDIDATES, ["USER.md"]);
  assert.deepEqual(getUserMdCandidatePaths("/workspace"), [
    "/workspace/USER.md",
  ]);
});
