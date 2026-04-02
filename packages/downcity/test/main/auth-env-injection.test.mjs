/**
 * Auth 环境变量注入测试。
 *
 * 关键点（中文）
 * - 统一 token 解析优先级：显式 token > `DC_AUTH_TOKEN` > `DC_AGENT_TOKEN` > 本地 CLI 登录态。
 * - shell/tool 子进程只传播 `DC_AGENT_TOKEN`，不再自动合成 `DC_AUTH_TOKEN`。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  resolveCliAuthToken,
  writeCliAuthState,
} from "../../bin/main/auth/CliAuthStateStore.js";
import { buildShellContextEnv } from "../../bin/sessions/tools/shell/ShellHelpers.js";
import { applyInternalAgentAuthEnv } from "../../bin/main/auth/AuthEnv.js";

function createConsoleRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-auth-env-"));
  const dbPath = path.join(root, "downcity.db");
  return {
    root,
    dbPath,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("resolveCliAuthToken follows explicit > DC_AUTH_TOKEN > DC_AGENT_TOKEN > stored state", () => {
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

    assert.equal(
      resolveCliAuthToken({
        explicitToken: "dc_explicit",
        env: {
          DC_AUTH_TOKEN: "dc_auth",
          DC_AGENT_TOKEN: "dc_agent",
        },
        dbPath,
      }),
      "dc_explicit",
    );

    assert.equal(
      resolveCliAuthToken({
        env: {
          DC_AUTH_TOKEN: "dc_auth",
          DC_AGENT_TOKEN: "dc_agent",
        },
        dbPath,
      }),
      "dc_auth",
    );

    assert.equal(
      resolveCliAuthToken({
        env: {
          DC_AGENT_TOKEN: "dc_agent",
        },
        dbPath,
      }),
      "dc_agent",
    );

    assert.equal(
      resolveCliAuthToken({
        env: {},
        dbPath,
      }),
      "dc_stored",
    );
  } finally {
    cleanup();
  }
});

test("buildShellContextEnv keeps DC_AGENT_TOKEN and does not synthesize DC_AUTH_TOKEN", () => {
  const previousAgentToken = process.env.DC_AGENT_TOKEN;
  const previousAuthToken = process.env.DC_AUTH_TOKEN;
  try {
    process.env.DC_AGENT_TOKEN = "dc_agent";
    process.env.DC_AUTH_TOKEN = "dc_user_override";

    const env = buildShellContextEnv();
    assert.equal(env.DC_AGENT_TOKEN, "dc_agent");
    assert.equal(env.DC_AUTH_TOKEN, undefined);
  } finally {
    if (previousAgentToken === undefined) delete process.env.DC_AGENT_TOKEN;
    else process.env.DC_AGENT_TOKEN = previousAgentToken;

    if (previousAuthToken === undefined) delete process.env.DC_AUTH_TOKEN;
    else process.env.DC_AUTH_TOKEN = previousAuthToken;
  }
});

test("applyInternalAgentAuthEnv strips inherited DC_AUTH_TOKEN and preserves agent identity", () => {
  const targetEnv = {
    DC_AUTH_TOKEN: "dc_user_override",
  };

  applyInternalAgentAuthEnv({
    targetEnv,
    sourceEnv: {
      DC_AUTH_TOKEN: "dc_user_override",
      DC_AGENT_TOKEN: "dc_agent",
    },
  });

  assert.equal(targetEnv.DC_AUTH_TOKEN, undefined);
  assert.equal(targetEnv.DC_AGENT_TOKEN, "dc_agent");
});
