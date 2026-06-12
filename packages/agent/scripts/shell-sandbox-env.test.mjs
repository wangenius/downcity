/**
 * @file 验证 shell safe sandbox 注入的临时目录环境变量。
 *
 * 关键点（中文）
 * - 测试编译后的 shell 包导出，确保最终 package 产物包含一致行为。
 * - zsh heredoc 会读取 `TMPPREFIX` 创建临时文件，因此必须指向 sandbox tmp。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildMacOsSeatbeltSandboxEnv } from "@downcity/shell/sandbox/MacOsSeatbeltSandbox.js";
import { buildLinuxBubblewrapSandboxEnv } from "@downcity/shell/sandbox/LinuxBubblewrapSandbox.js";

function createParams() {
  const rootPath = "/tmp/downcity-shell-env/project";
  const sandboxDir = path.join(rootPath, ".downcity", "sandbox");
  const tmpDir = path.join(sandboxDir, "tmp");
  const cacheDir = path.join(sandboxDir, ".cache");

  return {
    executionId: "sh_test",
    executionDir: path.join(rootPath, ".downcity", "shell", "sh_test"),
    cmd: "printf hello",
    cwd: rootPath,
    shellPath: "/bin/zsh",
    login: true,
    baseEnv: {
      PATH: "/usr/bin:/bin",
      LANG: "C.UTF-8",
      DC_SESSION_ID: "session_test",
    },
    config: {
      backend: "macos-seatbelt",
      rootPath,
      sandboxDir,
      homeDir: sandboxDir,
      tmpDir,
      cacheDir,
      envAllowlist: ["PATH", "LANG"],
      writablePaths: [rootPath, sandboxDir],
      networkMode: "full",
    },
  };
}

function assertSandboxTmpEnv(env, tmpDir) {
  assert.equal(env.TMPDIR, tmpDir);
  assert.equal(env.TMP, tmpDir);
  assert.equal(env.TEMP, tmpDir);
  assert.equal(env.TEMPDIR, tmpDir);
  assert.equal(env.TMPPREFIX, path.join(tmpDir, "zsh"));
  assert.equal(env.DC_SANDBOX_TMP, tmpDir);
}

test("macOS seatbelt sandbox env points zsh TMPPREFIX at sandbox tmp", () => {
  const params = createParams();
  const env = buildMacOsSeatbeltSandboxEnv(params);

  assertSandboxTmpEnv(env, params.config.tmpDir);
});

test("Linux bubblewrap sandbox env points zsh TMPPREFIX at sandbox tmp", () => {
  const params = createParams();
  const env = buildLinuxBubblewrapSandboxEnv({
    ...params,
    config: {
      ...params.config,
      backend: "linux-bubblewrap",
    },
  });

  assertSandboxTmpEnv(env, params.config.tmpDir);
});
