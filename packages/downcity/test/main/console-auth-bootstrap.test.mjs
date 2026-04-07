/**
 * Console 启动期 token 初始化测试。
 *
 * 关键点（中文）
 * - 首次启动时，如果还没有本机 CLI 管理主体，应自动生成本机 access token。
 * - 新模型不再提示密码，也不再依赖用户名密码登录。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthService } from "../../bin/main/modules/http/auth/AuthService.js";
import { ensureConsoleAuthBootstrap } from "../../bin/main/modules/cli/ConsoleAuthBootstrap.js";

function createAuthService() {
  const dbPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "downcity-console-auth-")),
    "downcity.db",
  );
  const authService = new AuthService({ dbPath });
  return {
    authService,
    cleanup() {
      authService.close();
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    },
  };
}

test("ensureConsoleAuthBootstrap creates local CLI access token without password prompt", async () => {
  const { authService, cleanup } = createAuthService();
  try {
    let prompted = false;
    await ensureConsoleAuthBootstrap({
      authService,
      readPassword: async () => {
        prompted = true;
        return "should-not-be-used";
      },
    });

    const tokens = authService.listLocalCliTokens();
    assert.equal(prompted, false);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].name, "console-bootstrap");

    const principal = authService.authenticateBearerHeader(`Bearer ${authService.ensureLocalCliAccess({
      tokenName: "extra-test-token",
    }).token.token}`);
    assert.equal(principal.username, "local-cli");
    assert.equal(principal.roles.includes("admin"), true);
  } finally {
    cleanup();
  }
});

test("ensureConsoleAuthBootstrap skips when local CLI access is already initialized", async () => {
  const { authService, cleanup } = createAuthService();
  try {
    authService.ensureLocalCliAccess({
      tokenName: "bootstrap",
    });

    await ensureConsoleAuthBootstrap({
      authService,
      readPassword: async () => {
        throw new Error("should not prompt");
      },
    });

    const tokens = authService.listLocalCliTokens();
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].name, "bootstrap");
  } finally {
    cleanup();
  }
});
