/**
 * Console 启动期统一账户初始化测试。
 *
 * 关键点（中文）
 * - 首次启动时，如果还没有统一账户用户，应自动初始化首个管理员。
 * - 未输入密码时应回落到默认密码 `downcity`。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthService } from "../../bin/main/auth/AuthService.js";
import { ensureConsoleAuthBootstrap } from "../../bin/main/commands/ConsoleAuthBootstrap.js";

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

test("ensureConsoleAuthBootstrap creates default admin with fallback password", async () => {
  const { authService, cleanup } = createAuthService();
  try {
    await ensureConsoleAuthBootstrap({
      authService,
      readPassword: async () => "",
    });

    const login = authService.login({
      username: "admin",
      password: "downcity",
    });

    assert.equal(login.user.username, "admin");
    assert.equal(login.user.roles.includes("admin"), true);
    assert.equal(login.token.token.startsWith("dc_"), true);
  } finally {
    cleanup();
  }
});

test("ensureConsoleAuthBootstrap skips when admin already exists", async () => {
  const { authService, cleanup } = createAuthService();
  try {
    authService.bootstrapAdmin({
      username: "admin",
      password: "custom-pass",
      displayName: "Admin",
      tokenName: "bootstrap",
    });

    await ensureConsoleAuthBootstrap({
      authService,
      readPassword: async () => {
        throw new Error("should not prompt");
      },
    });

    const login = authService.login({
      username: "admin",
      password: "custom-pass",
    });
    assert.equal(login.user.username, "admin");
  } finally {
    cleanup();
  }
});
