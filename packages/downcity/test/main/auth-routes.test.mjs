/**
 * Auth API 路由测试（node:test）。
 *
 * 关键点（中文）
 * - 锁定“仅 Bearer Token，无用户名密码登录”的最小对外协议。
 * - 首个可用 token 只允许由本机 CLI 侧初始化，不再由 HTTP 路由签发。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Hono } from "hono";
import { registerAuthRoutes } from "../../bin/main/modules/http/auth/AuthRoutes.js";
import { AuthService } from "../../bin/main/modules/http/auth/AuthService.js";

function createIsolatedApp() {
  const dbPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "downcity-auth-")),
    "downcity.db",
  );
  const app = new Hono();
  const authService = new AuthService({ dbPath });
  registerAuthRoutes({
    app,
    authService,
  });
  return {
    app,
    authService,
    cleanup() {
      authService.close();
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    },
  };
}

function ensureLocalCliToken(authService, tokenName = "test-bootstrap") {
  return authService.ensureLocalCliAccess({
    tokenName,
  });
}

test("local CLI bootstrap token authenticates protected auth routes", async () => {
  const { app, authService, cleanup } = createIsolatedApp();
  try {
    const payload = ensureLocalCliToken(authService);

    assert.equal(payload.user.username, "local-cli");
    assert.equal(payload.token.token.startsWith("dc_"), true);

    const meResponse = await app.request("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${payload.token.token}`,
      },
    });
    const meBody = await meResponse.json();

    assert.equal(meResponse.status, 200);
    assert.equal(meBody.success, true);
    assert.equal(meBody.user.username, "local-cli");
    assert.equal(meBody.user.roles.includes("admin"), true);
    assert.equal(meBody.user.permissions.includes("auth.write"), true);
  } finally {
    cleanup();
  }
});

test("bootstrap login and password routes are removed from the public API", async () => {
  const { app, cleanup } = createIsolatedApp();
  try {
    const bootstrap = await app.request("/api/auth/bootstrap-admin", {
      method: "POST",
    });
    const login = await app.request("/api/auth/login", {
      method: "POST",
    });
    const passwordUpdate = await app.request("/api/auth/password/update", {
      method: "POST",
    });

    assert.equal(bootstrap.status, 404);
    assert.equal(login.status, 404);
    assert.equal(passwordUpdate.status, 404);
  } finally {
    cleanup();
  }
});

test("protected auth routes require bearer token", async () => {
  const { app, cleanup } = createIsolatedApp();
  try {
    const response = await app.request("/api/auth/me");
    const body = await response.json().catch(() => ({}));

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
  } finally {
    cleanup();
  }
});

test("auth status stays public and reflects local CLI bootstrap state", async () => {
  const { app, authService, cleanup } = createIsolatedApp();
  try {
    const before = await app.request("/api/auth/status");
    const beforeBody = await before.json();

    assert.equal(before.status, 200);
    assert.equal(beforeBody.success, true);
    assert.equal(beforeBody.initialized, false);
    assert.equal(beforeBody.requireToken, false);

    ensureLocalCliToken(authService);

    const after = await app.request("/api/auth/status");
    const afterBody = await after.json();

    assert.equal(after.status, 200);
    assert.equal(afterBody.success, true);
    assert.equal(afterBody.initialized, true);
    assert.equal(afterBody.requireToken, true);
  } finally {
    cleanup();
  }
});

test("token create list and delete follow authenticated lifecycle", async () => {
  const { app, authService, cleanup } = createIsolatedApp();
  try {
    const bootstrapToken = ensureLocalCliToken(authService).token.token;

    const createResponse = await app.request("/api/auth/token/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${bootstrapToken}`,
      },
      body: JSON.stringify({
        name: "chrome-extension",
      }),
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 200);
    assert.equal(createBody.success, true);
    assert.equal(createBody.token.name, "chrome-extension");
    assert.equal(createBody.token.token.startsWith("dc_"), true);

    const listResponse = await app.request("/api/auth/token/list", {
      headers: {
        Authorization: `Bearer ${bootstrapToken}`,
      },
    });
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listBody.success, true);
    assert.equal(Array.isArray(listBody.tokens), true);
    assert.equal(listBody.tokens.length, 2);

    const deleteTarget = listBody.tokens.find((item) => item.name === "chrome-extension");
    assert.equal(Boolean(deleteTarget?.id), true);

    const deleteResponse = await app.request("/api/auth/token/delete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${bootstrapToken}`,
      },
      body: JSON.stringify({
        tokenId: deleteTarget.id,
      }),
    });
    const deleteBody = await deleteResponse.json();

    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteBody.success, true);

    const deletedMe = await app.request("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${createBody.token.token}`,
      },
    });
    const deletedMeBody = await deletedMe.json();

    assert.equal(deletedMe.status, 401);
    assert.equal(deletedMeBody.success, false);
  } finally {
    cleanup();
  }
});

test("multi-user admin routes are removed from the public API", async () => {
  const { app, authService, cleanup } = createIsolatedApp();
  try {
    const adminToken = ensureLocalCliToken(authService).token.token;

    const removedRoute = await app.request("/api/auth/admin/users", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(removedRoute.status, 404);
  } finally {
    cleanup();
  }
});
