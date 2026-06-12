/**
 * @file 验证 Linux bubblewrap sandbox 参数生成。
 *
 * 关键点（中文）
 * - 测试编译后的 bin 输出，避免测试文件进入 package 源码导出面。
 * - 不启动真实 `bwrap`，只锁住路径挂载、网络开关与 shell 调用参数。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildLinuxBubblewrapArgs } from "@downcity/shell/sandbox/LinuxBubblewrapSandbox.js";

async function createSandboxFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-bwrap-"));
  const projectRoot = path.join(root, "project");
  const writablePath = path.join(projectRoot, ".downcity");
  const shellDir = path.join(writablePath, "shell", "sh_test");
  const sandboxDir = path.join(projectRoot, ".downcity", "sandbox");
  const tmpDir = path.join(sandboxDir, "tmp");
  const cacheDir = path.join(sandboxDir, ".cache");

  await fs.mkdir(shellDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });

  return {
    root,
    projectRoot,
    writablePath,
    shellDir,
    sandboxDir,
    tmpDir,
    cacheDir,
  };
}

function createParams(fixture, overrides = {}) {
  return {
    executionId: "sh_test",
    executionDir: fixture.shellDir,
    cmd: "printf hello",
    cwd: fixture.projectRoot,
    actualCwd: fixture.projectRoot,
    shellPath: "/bin/sh",
    login: true,
    baseEnv: {
      PATH: "/usr/bin:/bin",
      LANG: "C.UTF-8",
      DC_SESSION_ID: "session_test",
    },
    config: {
      backend: "linux-bubblewrap",
      rootPath: fixture.projectRoot,
      sandboxDir: fixture.sandboxDir,
      homeDir: fixture.sandboxDir,
      tmpDir: fixture.tmpDir,
      cacheDir: fixture.cacheDir,
      envAllowlist: ["PATH", "LANG"],
      writablePaths: [fixture.projectRoot, fixture.sandboxDir],
      networkMode: "off",
    },
    ...overrides,
  };
}

function hasArg(args, value) {
  return args.includes(value);
}

function hasOptionPair(args, option, sourcePath, targetPath = sourcePath) {
  for (let index = 0; index < args.length - 2; index += 1) {
    if (
      args[index] === option &&
      args[index + 1] === sourcePath &&
      args[index + 2] === targetPath
    ) {
      return true;
    }
  }
  return false;
}

function hasOptionValue(args, option, value) {
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === option && args[index + 1] === value) {
      return true;
    }
  }
  return false;
}

test("Linux bubblewrap args isolate network and overlay writable project paths", async () => {
  const fixture = await createSandboxFixture();
  try {
    const args = buildLinuxBubblewrapArgs(createParams(fixture));

    assert.equal(hasArg(args, "--die-with-parent"), true);
    assert.equal(hasArg(args, "--unshare-pid"), true);
    assert.equal(hasArg(args, "--unshare-net"), true);
    assert.equal(hasOptionPair(args, "--bind", fixture.projectRoot), true);
    assert.equal(hasOptionPair(args, "--bind", fixture.sandboxDir), false);
    assert.equal(hasOptionPair(args, "--ro-bind", fixture.projectRoot), false);
    assert.equal(hasOptionValue(args, "--dir", fixture.writablePath), false);
    assert.deepEqual(args.slice(-5), [
      "--chdir",
      fixture.projectRoot,
      "/bin/sh",
      "-lc",
      "printf hello",
    ]);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("Linux bubblewrap args keep root writable when sandbox writablePaths includes root", async () => {
  const fixture = await createSandboxFixture();
  try {
    const args = buildLinuxBubblewrapArgs(createParams(fixture, {
      config: {
        backend: "linux-bubblewrap",
        rootPath: fixture.projectRoot,
        sandboxDir: fixture.sandboxDir,
        homeDir: fixture.sandboxDir,
        tmpDir: fixture.tmpDir,
        cacheDir: fixture.cacheDir,
        envAllowlist: ["PATH"],
        writablePaths: [fixture.projectRoot],
        networkMode: "full",
      },
      login: false,
    }));

    assert.equal(hasArg(args, "--unshare-net"), false);
    assert.equal(hasOptionPair(args, "--bind", fixture.projectRoot), true);
    assert.equal(hasOptionPair(args, "--ro-bind", fixture.projectRoot), false);
    assert.deepEqual(args.slice(-5), [
      "--chdir",
      fixture.projectRoot,
      "/bin/sh",
      "-c",
      "printf hello",
    ]);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
