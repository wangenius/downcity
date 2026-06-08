/**
 * Chrome 扩展 RemoteAgent session 获取源码约束测试（node:test）。
 *
 * 关键点（中文）：
 * - 稳定的 chrome-extension session 会重复使用，不能每次发送都 POST create。
 * - 浏览器端 RemoteAgent client 应先 GET 已存在 session，只有 not found 才创建。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const AGENT_SESSION_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/agentSession.ts";
const REMOTE_AGENT_CLIENT_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/remoteAgentClient.ts";

test("remote agent client gets stable session before creating it", () => {
  const agentSessionSource = readFileSync(AGENT_SESSION_FILE, "utf8");
  const remoteAgentClientSource = readFileSync(REMOTE_AGENT_CLIENT_FILE, "utf8");

  assert.match(agentSessionSource, /export\s+async\s+function\s+getAgentSdkSessionInfo/u);
  assert.match(agentSessionSource, /method:\s*"GET"/u);
  assert.match(agentSessionSource, /api\/sdk\/sessions\/\$\{encodeURIComponent\(sessionId\)\}/u);

  assert.match(remoteAgentClientSource, /getAgentSdkSessionInfo\(\{/u);
  assert.match(remoteAgentClientSource, /if\s*\(!isSessionNotFoundError\(error\)\)\s*throw error/u);
  assert.match(remoteAgentClientSource, /ensureAgentSdkSession\(\{/u);
});
