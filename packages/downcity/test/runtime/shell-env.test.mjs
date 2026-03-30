/**
 * Shell env 注入测试（node:test）。
 *
 * 关键点（中文）
 * - 确认 shell 工具传入的 env 会覆盖宿主进程基础 env。
 * - 确认 `DC_CTX_*` 请求上下文变量仍会被注入。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  withRequestContext,
} from "../../bin/sessions/RequestContext.js";
import { buildShellContextEnv } from "../../bin/sessions/tools/shell/ShellHelpers.js";

test("buildShellContextEnv applies injected env and preserves request context vars", () => {
  const previousSharedKey = process.env.SHARED_KEY;
  const previousHostOnly = process.env.HOST_ONLY;
  const previousServerHost = process.env.DC_SERVER_HOST;
  const previousServerPort = process.env.DC_SERVER_PORT;

  process.env.SHARED_KEY = "host";
  process.env.HOST_ONLY = "host-only";
  process.env.DC_SERVER_HOST = "127.0.0.1";
  process.env.DC_SERVER_PORT = "5314";

  try {
    const env = withRequestContext(
      {
        sessionId: "ctx-1",
        requestId: "req-1",
      },
      () =>
        buildShellContextEnv({
          SHARED_KEY: "agent",
          GLOBAL_ONLY: "global-only",
          AGENT_ONLY: "agent-only",
        }),
    );

    assert.equal(env.HOST_ONLY, "host-only");
    assert.equal(env.GLOBAL_ONLY, "global-only");
    assert.equal(env.AGENT_ONLY, "agent-only");
    assert.equal(env.SHARED_KEY, "agent");
    assert.equal(env.DC_SESSION_ID, "ctx-1");
    assert.equal(env.DC_CTX_REQUEST_ID, "req-1");
    assert.equal(env.DC_CTX_SERVER_HOST, "127.0.0.1");
    assert.equal(env.DC_CTX_SERVER_PORT, "5314");
  } finally {
    if (previousSharedKey === undefined) delete process.env.SHARED_KEY;
    else process.env.SHARED_KEY = previousSharedKey;

    if (previousHostOnly === undefined) delete process.env.HOST_ONLY;
    else process.env.HOST_ONLY = previousHostOnly;

    if (previousServerHost === undefined) delete process.env.DC_SERVER_HOST;
    else process.env.DC_SERVER_HOST = previousServerHost;

    if (previousServerPort === undefined) delete process.env.DC_SERVER_PORT;
    else process.env.DC_SERVER_PORT = previousServerPort;
  }
});
