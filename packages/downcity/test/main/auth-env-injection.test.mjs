/**
 * Auth 环境变量注入测试。
 *
 * 关键点（中文）
 * - 统一 token 解析优先级：显式 token > `DC_AUTH_TOKEN` > `DC_AGENT_TOKEN`。
 * - shell/tool 子进程只传播 `DC_AGENT_TOKEN`，不再自动合成 `DC_AUTH_TOKEN`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCliAuthToken,
} from "../../bin/main/modules/http/auth/CliAuthStateStore.js";
import { buildShellContextEnv } from "../../bin/session/tools/shell/ShellToolFormatting.js";
import { applyInternalAgentAuthEnv } from "../../bin/main/modules/http/auth/AuthEnv.js";

test("resolveCliAuthToken follows explicit > DC_AUTH_TOKEN > DC_AGENT_TOKEN", () => {
  assert.equal(
    resolveCliAuthToken({
      explicitToken: "dc_explicit",
      env: {
        DC_AUTH_TOKEN: "dc_auth",
        DC_AGENT_TOKEN: "dc_agent",
      },
    }),
    "dc_explicit",
  );

  assert.equal(
    resolveCliAuthToken({
      env: {
        DC_AUTH_TOKEN: "dc_auth",
        DC_AGENT_TOKEN: "dc_agent",
      },
    }),
    "dc_auth",
  );

  assert.equal(
    resolveCliAuthToken({
      env: {
        DC_AGENT_TOKEN: "dc_agent",
      },
    }),
    "dc_agent",
  );

  assert.equal(
    resolveCliAuthToken({
      env: {},
    }),
    undefined,
  );
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
