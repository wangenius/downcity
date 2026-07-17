/**
 * @file 验证 Safe Sandbox 环境变量收敛与临时目录映射。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { build_macos_sandbox_env } from "@downcity/shell/sandbox/MacOsSeatbelt.js";
import { build_linux_sandbox_env } from "@downcity/shell/sandbox/LinuxBubblewrap.js";
import { resolve_sandbox_policy } from "@downcity/shell/sandbox/SandboxPolicy.js";

function create_request() {
  const root_path = "/tmp/downcity-shell-env/project";
  const sandbox_dir = path.join(root_path, ".downcity", "sandbox");
  return {
    execution_id: "sh_test",
    execution_dir: path.join(root_path, ".downcity", "shell", "sh_test"),
    cmd: "printf hello",
    cwd: root_path,
    shell_path: "/bin/zsh",
    login: true,
    base_env: {
      PATH: "/usr/bin:/bin",
      LANG: "C.UTF-8",
      DC_SESSION_ID: "session_test",
    },
    policy: {
      backend: "macos-seatbelt",
      root_path,
      sandbox_dir,
      home_dir: sandbox_dir,
      tmp_dir: path.join(sandbox_dir, "tmp"),
      cache_dir: path.join(sandbox_dir, ".cache"),
      env_allowlist: ["PATH", "LANG"],
      read_only_paths: ["/usr", "/bin"],
      read_write_paths: [root_path],
      network_mode: "full",
      fingerprint: "policy_test",
    },
  };
}

function assert_sandbox_tmp_env(env, tmp_dir) {
  assert.equal(env.TMPDIR, tmp_dir);
  assert.equal(env.TMP, tmp_dir);
  assert.equal(env.TEMP, tmp_dir);
  assert.equal(env.TEMPDIR, tmp_dir);
  assert.equal(env.TMPPREFIX, path.join(tmp_dir, "zsh"));
  assert.equal(env.DC_SANDBOX_TMP, tmp_dir);
}

test("macOS safe env points temporary variables at sandbox tmp", () => {
  const request = create_request();
  const env = build_macos_sandbox_env(request);
  assert_sandbox_tmp_env(env, request.policy.tmp_dir);
});

test("Linux safe env points temporary variables at sandbox tmp", () => {
  const request = create_request();
  const env = build_linux_sandbox_env({
    ...request,
    policy: { ...request.policy, backend: "linux-bubblewrap" },
  });
  assert_sandbox_tmp_env(env, request.policy.tmp_dir);
});

test("safe policy exports explicit agent env keys only", async () => {
  const policy = await resolve_sandbox_policy({
    rootPath: "/tmp/downcity-shell-env/project",
    env: {
      DYNAMIC_ENV_REPRO: "dynamic_value",
      DC_DYNAMIC_REPRO: "dc_value",
    },
  }, {});
  assert.equal(policy.env_allowlist.includes("PATH"), true);
  assert.equal(policy.env_allowlist.includes("DYNAMIC_ENV_REPRO"), true);
  assert.equal(policy.env_allowlist.includes("DC_DYNAMIC_REPRO"), true);
  assert.equal(policy.env_allowlist.includes("HOST_ONLY_ENV_REPRO"), false);
});
