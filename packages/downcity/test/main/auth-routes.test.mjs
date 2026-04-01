/**
 * Auth API 路由测试（node:test）。
 *
 * 关键点（中文）
 * - 先锁定统一账户 V1 的最小对外协议：bootstrap、login、me、token create/list/revoke。
 * - 所有测试都使用临时 console root，避免污染真实 `~/.downcity`。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Hono } from "hono";
import { registerAuthRoutes } from "../../bin/main/auth/AuthRoutes.js";
import { AuthService } from "../../bin/main/auth/AuthService.js";

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
    cleanup() {
      authService.close();
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    },
  };
}

async function bootstrapAdmin(app) {
  const response = await app.request("/api/auth/bootstrap-admin", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "admin",
      password: "pass-123456",
      displayName: "Admin",
      tokenName: "bootstrap",
    }),
  });
  const body = await response.json();
  return { response, body };
}

test("bootstrap-admin creates first admin and returns bearer token", async () => {
  const { app, cleanup } = createIsolatedApp();
  try {
    const { response, body } = await bootstrapAdmin(app);

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.user.username, "admin");
    assert.equal(Array.isArray(body.user.roles), true);
    assert.equal(body.user.roles.includes("admin"), true);
    assert.equal(typeof body.token.token, "string");
    assert.equal(body.token.token.startsWith("dc_"), true);

    const meResponse = await app.request("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${body.token.token}`,
      },
    });
    const meBody = await meResponse.json();

    assert.equal(meResponse.status, 200);
    assert.equal(meBody.success, true);
    assert.equal(meBody.user.username, "admin");
    assert.equal(meBody.user.roles.includes("admin"), true);
    assert.equal(meBody.user.permissions.includes("auth.write"), true);
  } finally {
    cleanup();
  }
});

test("bootstrap-admin rejects second bootstrap after first user exists", async () => {
  const { app, cleanup } = createIsolatedApp();
  try {
    const first = await bootstrapAdmin(app);
    assert.equal(first.response.status, 200);

    const second = await app.request("/api/auth/bootstrap-admin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "admin2",
        password: "pass-123456",
      }),
    });
    const secondBody = await second.json();

    assert.equal(second.status, 409);
    assert.equal(secondBody.success, false);
  } finally {
    cleanup();
  }
});

test("login rejects wrong password and succeeds with correct password", async () => {
  const { app, cleanup } = createIsolatedApp();
  try {
    await bootstrapAdmin(app);

    const rejected = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        password: "wrong-password",
      }),
    });
    const rejectedBody = await rejected.json();

    assert.equal(rejected.status, 401);
    assert.equal(rejectedBody.success, false);

    const accepted = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        password: "pass-123456",
        tokenName: "console-ui",
      }),
    });
    const acceptedBody = await accepted.json();

    assert.equal(accepted.status, 200);
    assert.equal(acceptedBody.success, true);
    assert.equal(acceptedBody.user.username, "admin");
    assert.equal(acceptedBody.token.name, "console-ui");
    assert.equal(acceptedBody.token.token.startsWith("dc_"), true);
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

test("auth status stays public and tells whether unified auth is initialized", async () => {
  const { app, cleanup } = createIsolatedApp();
  try {
    const before = await app.request("/api/auth/status");
    const beforeBody = await before.json();

    assert.equal(before.status, 200);
    assert.equal(beforeBody.success, true);
    assert.equal(beforeBody.initialized, false);
    assert.equal(beforeBody.requireLogin, false);

    await bootstrapAdmin(app);

    const after = await app.request("/api/auth/status");
    const afterBody = await after.json();

    assert.equal(after.status, 200);
    assert.equal(afterBody.success, true);
    assert.equal(afterBody.initialized, true);
    assert.equal(afterBody.requireLogin, true);
  } finally {
    cleanup();
  }
});

test("token create list and revoke follow authenticated lifecycle", async () => {
  const { app, cleanup } = createIsolatedApp();
  try {
    const bootstrap = await bootstrapAdmin(app);
    const bootstrapToken = bootstrap.body.token.token;

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

    const revokeTarget = listBody.tokens.find((item) => item.name === "chrome-extension");
    assert.equal(Boolean(revokeTarget?.id), true);

    const revokeResponse = await app.request("/api/auth/token/revoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${bootstrapToken}`,
      },
      body: JSON.stringify({
        tokenId: revokeTarget.id,
      }),
    });
    const revokeBody = await revokeResponse.json();

    assert.equal(revokeResponse.status, 200);
    assert.equal(revokeBody.success, true);
    assert.equal(revokeBody.token.id, revokeTarget.id);
    assert.equal(typeof revokeBody.token.revokedAt, "string");

    const revokedMe = await app.request("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${createBody.token.token}`,
      },
    });
    const revokedMeBody = await revokedMe.json();

    assert.equal(revokedMe.status, 401);
    assert.equal(revokedMeBody.success, false);
  } finally {
    cleanup();
  }
});
