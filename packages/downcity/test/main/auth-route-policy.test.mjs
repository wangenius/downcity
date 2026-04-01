/**
 * Auth 路由策略中间件测试（node:test）。
 *
 * 关键点（中文）
 * - 未初始化统一账户前，受保护接口允许通过，避免首次部署直接锁死。
 * - 初始化后统一要求 Bearer Token，并按权限矩阵拦截高危写操作。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Hono } from "hono";
import { AuthService } from "../../bin/main/auth/AuthService.js";
import { AuthStore } from "../../bin/main/auth/AuthStore.js";
import { createRouteAuthGuardMiddleware } from "../../bin/main/auth/RoutePolicy.js";
import { hashPassword } from "../../bin/main/auth/PasswordHasher.js";

function createTestHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-auth-policy-"));
  const dbPath = path.join(root, "downcity.db");
  const store = new AuthStore({ dbPath });
  const authService = new AuthService({ store });
  const app = new Hono();
  app.use("*", createRouteAuthGuardMiddleware(authService));
  app.get("/api/services/list", (c) => c.json({ success: true, route: "service.read" }));
  app.post("/api/services/control", (c) => c.json({ success: true, route: "service.write" }));
  return {
    app,
    store,
    authService,
    cleanup() {
      authService.close();
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("protected routes stay open before any auth user is bootstrapped", async () => {
  const { app, cleanup } = createTestHarness();
  try {
    const response = await app.request("/api/services/list");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
  } finally {
    cleanup();
  }
});

test("protected routes require bearer token after bootstrap", async () => {
  const { app, authService, cleanup } = createTestHarness();
  try {
    authService.bootstrapAdmin({
      username: "admin",
      password: "pass-123456",
      tokenName: "bootstrap",
    });

    const response = await app.request("/api/services/list");
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
  } finally {
    cleanup();
  }
});

test("route policy allows read permission and blocks missing write permission", async () => {
  const { app, store, authService, cleanup } = createTestHarness();
  try {
    authService.bootstrapAdmin({
      username: "admin",
      password: "pass-123456",
      tokenName: "bootstrap",
    });

    store.ensureDefaultCatalog();
    const viewer = store.createUser({
      username: "viewer",
      passwordHash: hashPassword("viewer-pass"),
      status: "active",
    });
    store.assignRoleToUser({
      userId: viewer.id,
      roleName: "viewer",
    });

    const login = authService.login({
      username: "viewer",
      password: "viewer-pass",
      tokenName: "viewer-token",
    });

    const readResponse = await app.request("/api/services/list", {
      headers: {
        Authorization: `Bearer ${login.token.token}`,
      },
    });
    const readBody = await readResponse.json();

    assert.equal(readResponse.status, 200);
    assert.equal(readBody.success, true);

    const writeResponse = await app.request("/api/services/control", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${login.token.token}`,
      },
    });
    const writeBody = await writeResponse.json();

    assert.equal(writeResponse.status, 403);
    assert.equal(writeBody.success, false);
  } finally {
    cleanup();
  }
});
