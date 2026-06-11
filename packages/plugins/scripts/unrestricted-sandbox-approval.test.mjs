/**
 * @file 验证 shell unrestricted sandbox 审批运行时。
 *
 * 关键点（中文）
 * - 测试编译后的 bin 输出，避免测试文件进入 package 源码导出面。
 * - 直接驱动 shell runtime state，模拟 UI/Console 收到 approval_id 后批准或拒绝。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  approveShellApproval,
  closeAllShellSessions,
  createShellPluginState,
  denyShellApproval,
  execShellCommand,
  startShellSession,
} from "../bin/shell/runtime/ShellActionRuntime.js";

async function create_fixture() {
  const root_path = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-unrestricted-"));
  const events = [];
  const context = {
    rootPath: root_path,
    env: {},
    config: { id: "test-agent" },
    paths: {
      getDowncityChannelMetaPath: () => path.join(root_path, ".downcity", "channel", "meta.json"),
    },
    session: {
      get: () => ({
        publishEvent: (event) => {
          events.push(event);
        },
      }),
    },
  };
  return {
    root_path,
    events,
    context,
  };
}

async function wait_for_approval(state) {
  const started_at = Date.now();
  while (Date.now() - started_at < 2000) {
    const approval = Array.from(state.approvals.values())[0];
    if (approval) return approval;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("approval request was not created");
}

test("shell_start unrestricted requires reason", async () => {
  const fixture = await create_fixture();
  const state = createShellPluginState({ defaultApprovalTimeoutMs: 500 });
  try {
    await assert.rejects(
      startShellSession(state, fixture.context, {
        cmd: "printf should-not-run",
        cwd: fixture.root_path,
        shell: "/bin/sh",
        login: false,
        sandbox: "unrestricted",
      }),
      /requires a non-empty reason/,
    );
  } finally {
    await closeAllShellSessions(state, true);
    await fs.rm(fixture.root_path, { recursive: true, force: true });
  }
});

test("shell_start unrestricted denied returns denied tool result without execution", async () => {
  const fixture = await create_fixture();
  const state = createShellPluginState({
    defaultApprovalTimeoutMs: 2000,
    defaultInlineWaitMs: 20,
  });
  try {
    const marker_path = path.join(fixture.root_path, "should-not-exist.txt");
    const pending_result = startShellSession(state, fixture.context, {
      cmd: `printf denied > ${JSON.stringify(marker_path)}`,
      cwd: fixture.root_path,
      shell: "/bin/sh",
      login: false,
      sandbox: "unrestricted",
      reason: "测试拒绝 unrestricted sandbox 不会执行命令。",
      ownerContextId: "session_test",
    });

    const approval = await wait_for_approval(state);
    assert.equal(approval.toolName, "shell_start");
    assert.equal(fixture.events[0]?.type, "tool-approval-request");
    assert.equal(fixture.events[0]?.approvalId, approval.approvalId);

    assert.equal(
      await denyShellApproval(state, fixture.context, approval.approvalId),
      true,
    );
    const result = await pending_result;

    assert.equal(result.shell.sandboxMode, "unrestricted");
    assert.equal(result.shell.approvalStatus, "denied");
    assert.equal(result.shell.status, "failed");
    assert.match(result.chunk.output, /User denied unrestricted sandbox execution/);
    await assert.rejects(fs.stat(marker_path), /ENOENT/);
    assert.equal(fixture.events.at(-1)?.type, "tool-approval-result");
    assert.equal(fixture.events.at(-1)?.decision, "denied");
  } finally {
    await closeAllShellSessions(state, true);
    await fs.rm(fixture.root_path, { recursive: true, force: true });
  }
});

test("shell_exec unrestricted approved executes in unrestricted sandbox", async () => {
  const fixture = await create_fixture();
  const state = createShellPluginState({
    defaultApprovalTimeoutMs: 2000,
    defaultInlineWaitMs: 20,
    defaultExecTimeoutMs: 2000,
  });
  try {
    const pending_result = execShellCommand(state, fixture.context, {
      cmd: "printf unrestricted-ok",
      cwd: fixture.root_path,
      shell: "/bin/sh",
      login: false,
      sandbox: "unrestricted",
      reason: "测试批准后执行 unrestricted sandbox 命令。",
      timeoutMs: 2000,
    });

    const approval = await wait_for_approval(state);
    assert.equal(approval.toolName, "shell_exec");
    assert.equal(
      await approveShellApproval(state, fixture.context, approval.approvalId),
      true,
    );
    const result = await pending_result;

    assert.equal(result.shell.sandboxed, false);
    assert.equal(result.shell.sandboxMode, "unrestricted");
    assert.equal(result.shell.approvalStatus, "approved");
    assert.equal(result.shell.exitCode, 0);
    assert.equal(result.chunk.output, "unrestricted-ok");
  } finally {
    await closeAllShellSessions(state, true);
    await fs.rm(fixture.root_path, { recursive: true, force: true });
  }
});
