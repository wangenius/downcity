/**
 * QQ gateway 辅助逻辑测试（node:test）。
 *
 * 关键点（中文）
 * - 运行态状态文案与 linkState 判断必须稳定。
 * - WebSocket payload 解析必须兼容 string / Buffer 两种输入。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQqGatewayRuntimeStatus,
  parseQqGatewayPayload,
} from "../../bin/services/chat/channels/qq/QQGatewaySupport.js";

test("buildQqGatewayRuntimeStatus reports connected when socket/context/heartbeat are ready", () => {
  const status = buildQqGatewayRuntimeStatus({
    isRunning: true,
    wsReadyState: 1,
    wsContextId: "ctx_qq_ready",
    wsReadyAtMs: Date.now() - 2000,
    heartbeatIntervalMs: 30000,
    lastHeartbeatSentAtMs: Date.now() - 1000,
    lastHeartbeatAckAtMs: Date.now() - 500,
    pendingHeartbeatSinceMs: 0,
    reconnectAttempts: 1,
    maxReconnectAttempts: 5,
    reconnectScheduled: false,
    useSandbox: false,
  });

  assert.equal(status.running, true);
  assert.equal(status.linkState, "connected");
  assert.equal(status.statusText, "ws_online");
  assert.equal(status.detail.heartbeatHealthy, true);
  assert.equal(status.detail.heartbeatAckTimeoutMs, 90000);
});

test("buildQqGatewayRuntimeStatus reports heartbeat timeout when ack is overdue", () => {
  const now = Date.now();
  const status = buildQqGatewayRuntimeStatus({
    isRunning: true,
    wsReadyState: 1,
    wsContextId: "ctx_qq_wait_ack",
    wsReadyAtMs: now - 10000,
    heartbeatIntervalMs: 30000,
    lastHeartbeatSentAtMs: now - 95000,
    lastHeartbeatAckAtMs: now - 100000,
    pendingHeartbeatSinceMs: now - 95000,
    reconnectAttempts: 2,
    maxReconnectAttempts: 5,
    reconnectScheduled: true,
    useSandbox: true,
  });

  assert.equal(status.linkState, "unknown");
  assert.equal(status.statusText, "heartbeat_timeout");
  assert.equal(status.detail.heartbeatHealthy, false);
  assert.equal(status.detail.sandbox, true);
});

test("parseQqGatewayPayload parses string and buffer payloads", () => {
  const stringPayload = parseQqGatewayPayload('{"op":10,"d":{"heartbeat_interval":30000},"s":12,"t":"READY"}');
  const bufferPayload = parseQqGatewayPayload(Buffer.from('{"op":11,"d":{},"s":13,"t":"RESUMED"}', "utf-8"));

  assert.deepEqual(stringPayload, {
    op: 10,
    d: {
      heartbeat_interval: 30000,
    },
    s: 12,
    t: "READY",
  });
  assert.deepEqual(bufferPayload, {
    op: 11,
    d: {},
    s: 13,
    t: "RESUMED",
  });
});
