/**
 * Agent Token 服务测试。
 *
 * 关键点（中文）
 * - 同一个项目重复调用 `ensureAgentToken()` 时，不能返回空 token。
 * - 否则 agent 进程会把空字符串注入 `DC_AGENT_TOKEN`，导致后续 `city task` 缺失 Bearer Token。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureAgentToken } from "../../bin/main/auth/AgentTokenService.js";
import { AuthService } from "../../bin/main/auth/AuthService.js";

function createConsoleRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-agent-token-"));
  return {
    root,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("ensureAgentToken returns a fresh plain token when an existing token record is already present", () => {
  const { root, cleanup } = createConsoleRoot();
  const projectRoot = "/tmp/downcity-agent-token-project";
  const previousRoot = process.env.DC_CONSOLE_ROOT;

  process.env.DC_CONSOLE_ROOT = root;
  try {
    const authService = new AuthService({
      dbPath: path.join(root, "downcity.db"),
    });
    authService.bootstrapAdmin({
      username: "admin",
      password: "downcity",
      displayName: "Admin",
      tokenName: "bootstrap",
    });
    authService.close();

    const first = ensureAgentToken(projectRoot);
    assert.equal(typeof first.token, "string");
    assert.equal(first.token.startsWith("dc_"), true);

    const second = ensureAgentToken(projectRoot);
    assert.equal(typeof second.token, "string");
    assert.equal(second.token.startsWith("dc_"), true);
    assert.notEqual(second.token, "");
  } finally {
    if (previousRoot === undefined) delete process.env.DC_CONSOLE_ROOT;
    else process.env.DC_CONSOLE_ROOT = previousRoot;
    cleanup();
  }
});
