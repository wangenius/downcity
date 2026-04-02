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

test("auth admin routes can manage users and issue or revoke user tokens", async () => {
  const { app, cleanup } = createIsolatedApp();
  try {
    const bootstrap = await bootstrapAdmin(app);
    const adminToken = bootstrap.body.token.token;

    const initialUsers = await app.request("/api/auth/admin/users", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const initialUsersBody = await initialUsers.json();

    assert.equal(initialUsers.status, 200);
    assert.equal(initialUsersBody.success, true);
    assert.equal(Array.isArray(initialUsersBody.users), true);
    assert.equal(Array.isArray(initialUsersBody.roles), true);
    assert.equal(initialUsersBody.users.length, 1);

    const createUser = await app.request("/api/auth/admin/users/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        username: "viewer-user",
        password: "viewer-pass",
        displayName: "Viewer User",
        roleNames: ["viewer"],
      }),
    });
    const createUserBody = await createUser.json();

    assert.equal(createUser.status, 200);
    assert.equal(createUserBody.success, true);
    assert.equal(createUserBody.user.username, "viewer-user");
    assert.deepEqual(createUserBody.user.roles, ["viewer"]);

    const loginViewer = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "viewer-user",
        password: "viewer-pass",
        tokenName: "viewer-login",
      }),
    });
    const loginViewerBody = await loginViewer.json();

    assert.equal(loginViewer.status, 200);
    assert.equal(loginViewerBody.success, true);
    assert.equal(loginViewerBody.token.name, "viewer-login");

    const managedUserId = String(createUserBody.user.id || "");
    assert.equal(Boolean(managedUserId), true);

    const createManagedToken = await app.request(
      `/api/auth/admin/users/${encodeURIComponent(managedUserId)}/tokens/create`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "chrome-extension",
        }),
      },
    );
    const createManagedTokenBody = await createManagedToken.json();

    assert.equal(createManagedToken.status, 200);
    assert.equal(createManagedTokenBody.success, true);
    assert.equal(createManagedTokenBody.token.name, "chrome-extension");
    assert.equal(createManagedTokenBody.token.token.startsWith("dc_"), true);

    const listManagedTokens = await app.request(
      `/api/auth/admin/users/${encodeURIComponent(managedUserId)}/tokens`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );
    const listManagedTokensBody = await listManagedTokens.json();

    assert.equal(listManagedTokens.status, 200);
    assert.equal(listManagedTokensBody.success, true);
    assert.equal(Array.isArray(listManagedTokensBody.tokens), true);
    assert.equal(listManagedTokensBody.tokens.length, 2);

    const revokeManagedTokenTarget = listManagedTokensBody.tokens.find(
      (item) => item.name === "viewer-login",
    );
    assert.equal(Boolean(revokeManagedTokenTarget?.id), true);

    const revokeManagedToken = await app.request(
      `/api/auth/admin/users/${encodeURIComponent(managedUserId)}/tokens/revoke`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          tokenId: revokeManagedTokenTarget.id,
        }),
      },
    );
    const revokeManagedTokenBody = await revokeManagedToken.json();

    assert.equal(revokeManagedToken.status, 200);
    assert.equal(revokeManagedTokenBody.success, true);
    assert.equal(revokeManagedTokenBody.token.id, revokeManagedTokenTarget.id);
    assert.equal(typeof revokeManagedTokenBody.token.revokedAt, "string");

    const revokedViewerMe = await app.request("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${loginViewerBody.token.token}`,
      },
    });
    const revokedViewerMeBody = await revokedViewerMe.json();

    assert.equal(revokedViewerMe.status, 401);
    assert.equal(revokedViewerMeBody.success, false);

    const updateRoles = await app.request(
      `/api/auth/admin/users/${encodeURIComponent(managedUserId)}/roles`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          roleNames: ["operator"],
        }),
      },
    );
    const updateRolesBody = await updateRoles.json();

    assert.equal(updateRoles.status, 200);
    assert.equal(updateRolesBody.success, true);
    assert.deepEqual(updateRolesBody.user.roles, ["operator"]);

    const disableUser = await app.request(
      `/api/auth/admin/users/${encodeURIComponent(managedUserId)}/update`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          status: "disabled",
        }),
      },
    );
    const disableUserBody = await disableUser.json();

    assert.equal(disableUser.status, 200);
    assert.equal(disableUserBody.success, true);
    assert.equal(disableUserBody.user.status, "disabled");

    const disabledLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "viewer-user",
        password: "viewer-pass",
      }),
    });
    const disabledLoginBody = await disabledLogin.json();

    assert.equal(disabledLogin.status, 403);
    assert.equal(disabledLoginBody.success, false);
  } finally {
    cleanup();
  }
});

test("auth admin write routes reject users without auth.write permission", async () => {
  const { app, cleanup } = createIsolatedApp();
  try {
    await bootstrapAdmin(app);

    const adminLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        password: "pass-123456",
        tokenName: "admin-login",
      }),
    });
    const adminLoginBody = await adminLogin.json();
    const adminToken = adminLoginBody.token.token;

    const createViewer = await app.request("/api/auth/admin/users/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        username: "viewer-only",
        password: "viewer-pass",
        roleNames: ["viewer"],
      }),
    });
    const createViewerBody = await createViewer.json();
    const viewerUserId = String(createViewerBody.user.id || "");

    const viewerLogin = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "viewer-only",
        password: "viewer-pass",
        tokenName: "viewer-login",
      }),
    });
    const viewerLoginBody = await viewerLogin.json();

    const writeAttempt = await app.request(
      `/api/auth/admin/users/${encodeURIComponent(viewerUserId)}/roles`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${viewerLoginBody.token.token}`,
        },
        body: JSON.stringify({
          roleNames: ["operator"],
        }),
      },
    );
    const writeAttemptBody = await writeAttempt.json();

    assert.equal(writeAttempt.status, 403);
    assert.equal(writeAttemptBody.success, false);
  } finally {
    cleanup();
  }
});
