/**
 * @file 验证宿主只读目录的策略校验与 macOS profile 权限映射。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolve_sandbox_policy } from "@downcity/shell/sandbox/SandboxPolicy.js";
import { build_macos_seatbelt_profile } from "@downcity/shell/sandbox/MacOsSeatbelt.js";
import {
  closeAllShellSessions,
  createShellRuntimeState,
  execShellCommand,
} from "@downcity/shell/session/ShellActionRuntime.js";

async function create_fixture() {
  const fixture_root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-policy-"));
  const project_root = path.join(fixture_root, "project");
  const tool_root = path.join(fixture_root, "tools", "officecli", "v1");
  await fs.mkdir(project_root, { recursive: true });
  await fs.mkdir(tool_root, { recursive: true, mode: 0o755 });
  await fs.chmod(tool_root, 0o755);
  return { fixture_root, project_root, tool_root };
}

test("host tool directory enters read-only policy only", async () => {
  const fixture = await create_fixture();
  try {
    const policy = await resolve_sandbox_policy({
      rootPath: fixture.project_root,
      safe_read_only_paths: [fixture.tool_root],
    }, {});
    const real_tool_root = await fs.realpath(fixture.tool_root);
    assert.equal(policy.read_only_paths.includes(real_tool_root), true);
    assert.equal(policy.read_write_paths.includes(real_tool_root), false);

    const profile = build_macos_seatbelt_profile({
      execution_id: "sh_test",
      execution_dir: path.join(fixture.project_root, ".downcity", "shell", "sh_test"),
      cmd: "officecli --version",
      cwd: fixture.project_root,
      shell_path: "/bin/zsh",
      login: true,
      base_env: {},
      policy: { ...policy, backend: "macos-seatbelt" },
    });
    assert.match(profile, new RegExp(`allow file-read\\* \\(subpath "${real_tool_root}"\\)`));
    assert.doesNotMatch(profile, new RegExp(`allow file-write\\* \\(subpath "${real_tool_root}"\\)`));
  } finally {
    await fs.rm(fixture.fixture_root, { recursive: true, force: true });
  }
});

test("host tool directory cannot overlap workspace writable root", async () => {
  const fixture = await create_fixture();
  try {
    const nested_tool_root = path.join(fixture.project_root, "tools");
    await fs.mkdir(nested_tool_root, { recursive: true, mode: 0o755 });
    await assert.rejects(
      resolve_sandbox_policy({
        rootPath: fixture.project_root,
        safe_read_only_paths: [nested_tool_root],
      }, {}),
      /overlaps a writable path/,
    );
  } finally {
    await fs.rm(fixture.fixture_root, { recursive: true, force: true });
  }
});

test("group or world writable host tool directory is rejected", async () => {
  const fixture = await create_fixture();
  try {
    await fs.chmod(fixture.tool_root, 0o777);
    await assert.rejects(
      resolve_sandbox_policy({
        rootPath: fixture.project_root,
        safe_read_only_paths: [fixture.tool_root],
      }, {}),
      /must not be group\/world writable/,
    );
  } finally {
    await fs.rm(fixture.fixture_root, { recursive: true, force: true });
  }
});

test("macOS safe sandbox runs system Git through selected Xcode", {
  skip: process.platform !== "darwin",
}, async () => {
  const fixture = await create_fixture();
  const state = createShellRuntimeState();
  try {
    const result = await execShellCommand(state, {
      rootPath: fixture.project_root,
      env: {},
    }, {
      cmd: "git --version",
      cwd: fixture.project_root,
      shell: "/bin/zsh",
      login: true,
      sandbox: "safe",
      timeoutMs: 10_000,
    });
    assert.equal(result.shell.status, "completed", result.chunk.output);
    assert.match(result.chunk.output, /^git version /);
    assert.doesNotMatch(result.chunk.output, /xcrun_db/);
    assert.equal(typeof result.shell.sandboxPolicyFingerprint, "string");
  } finally {
    await closeAllShellSessions(state, true);
    await fs.rm(fixture.fixture_root, { recursive: true, force: true });
  }
});

test("macOS host tool directory is executable but remains read-only", {
  skip: process.platform !== "darwin",
}, async () => {
  const fixture = await create_fixture();
  const state = createShellRuntimeState();
  const executable_path = path.join(fixture.tool_root, "tool-test");
  try {
    await fs.writeFile(executable_path, "#!/bin/sh\nprintf tool-ok\n", { mode: 0o755 });
    const context = {
      rootPath: fixture.project_root,
      env: {},
      safe_read_only_paths: [fixture.tool_root],
    };
    const execute_result = await execShellCommand(state, context, {
      cmd: JSON.stringify(executable_path),
      cwd: fixture.project_root,
      shell: "/bin/sh",
      login: false,
      sandbox: "safe",
      timeoutMs: 10_000,
    });
    assert.equal(execute_result.shell.status, "completed");
    assert.equal(execute_result.chunk.output, "tool-ok");

    const write_result = await execShellCommand(state, context, {
      cmd: `printf changed > ${JSON.stringify(executable_path)}`,
      cwd: fixture.project_root,
      shell: "/bin/sh",
      login: false,
      sandbox: "safe",
      timeoutMs: 10_000,
    });
    assert.equal(write_result.shell.status, "failed");
    assert.equal(await fs.readFile(executable_path, "utf8"), "#!/bin/sh\nprintf tool-ok\n");
  } finally {
    await closeAllShellSessions(state, true);
    await fs.rm(fixture.fixture_root, { recursive: true, force: true });
  }
});
