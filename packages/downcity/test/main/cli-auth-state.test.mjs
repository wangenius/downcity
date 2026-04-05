/**
 * CLI 认证状态与自动鉴权测试。
 *
 * 关键点（中文）
 * - CLI 应把 bootstrap token 写入本地加密存储，后续命令自动复用。
 * - `callServer()` 应按 `显式 token > DC_AUTH_TOKEN > 本地存储` 注入 Bearer Token。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthService } from "../../bin/main/modules/http/auth/AuthService.js";
import {
  clearCliAuthState,
  readCliAuthState,
  resolveCliAuthToken,
  writeCliAuthState,
} from "../../bin/main/modules/http/auth/CliAuthStateStore.js";
import { ensureConsoleAuthBootstrap } from "../../bin/main/modules/cli/ConsoleAuthBootstrap.js";
import { callServer } from "../../bin/main/city/daemon/Client.js";

function createConsoleRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-cli-auth-"));
  const dbPath = path.join(root, "downcity.db");
  return {
    root,
    dbPath,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("ensureConsoleAuthBootstrap persists bootstrap token for CLI reuse", async () => {
  const { root, dbPath, cleanup } = createConsoleRoot();
  const previousRoot = process.env.DC_CONSOLE_ROOT;
  process.env.DC_CONSOLE_ROOT = root;
  const authService = new AuthService({ dbPath });
  try {
    await ensureConsoleAuthBootstrap({
      authService,
      readPassword: async () => "downcity",
    });

    const state = readCliAuthState({ dbPath });
    assert.ok(state?.token);
    assert.equal(state?.username, "admin");
    assert.equal(state?.source, "bootstrap");
  } finally {
    authService.close();
    if (previousRoot === undefined) delete process.env.DC_CONSOLE_ROOT;
    else process.env.DC_CONSOLE_ROOT = previousRoot;
    cleanup();
  }
});

test("resolveCliAuthToken uses explicit token before env and stored state", () => {
  const { dbPath, cleanup } = createConsoleRoot();
  try {
    writeCliAuthState(
      {
        token: "dc_stored",
        username: "admin",
        source: "manual",
      },
      { dbPath },
    );

    const token = resolveCliAuthToken({
      explicitToken: "dc_explicit",
      env: { DC_AUTH_TOKEN: "dc_env" },
      dbPath,
    });
    assert.equal(token, "dc_explicit");
  } finally {
    cleanup();
  }
});

test("callServer injects bearer token from env or local CLI auth state", async () => {
  const { root, dbPath, cleanup } = createConsoleRoot();
  const previousRoot = process.env.DC_CONSOLE_ROOT;
  const previousEnvToken = process.env.DC_AUTH_TOKEN;
  process.env.DC_CONSOLE_ROOT = root;

  const originalFetch = globalThis.fetch;
  const seenHeaders = [];
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers || {});
    seenHeaders.push(headers.get("authorization"));
    return Response.json({ success: true });
  };

  try {
    clearCliAuthState({ dbPath });
    writeCliAuthState(
      {
        token: "dc_stored",
        source: "manual",
      },
      { dbPath },
    );

    delete process.env.DC_AUTH_TOKEN;
    await callServer({
      projectRoot: "/tmp/project-a",
      path: "/api/services/list",
      method: "GET",
    });

    process.env.DC_AUTH_TOKEN = "dc_env";
    await callServer({
      projectRoot: "/tmp/project-b",
      path: "/api/services/list",
      method: "GET",
    });

    await callServer({
      projectRoot: "/tmp/project-c",
      path: "/api/services/list",
      method: "GET",
      authToken: "dc_explicit",
    });

    assert.deepEqual(seenHeaders, [
      "Bearer dc_stored",
      "Bearer dc_env",
      "Bearer dc_explicit",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvToken === undefined) delete process.env.DC_AUTH_TOKEN;
    else process.env.DC_AUTH_TOKEN = previousEnvToken;
    if (previousRoot === undefined) delete process.env.DC_CONSOLE_ROOT;
    else process.env.DC_CONSOLE_ROOT = previousRoot;
    cleanup();
  }
});
