/**
 * CLI 端口提示测试（node:test）。
 *
 * 关键点（中文）
 * - 锁定启动输出里的端口说明，避免用户再次搞不清 5314/5315 的职责。
 * - 这里不测试版式，只测试语义内容。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConsolePortFacts,
  buildRuntimePortFacts,
} from "../../bin/main/modules/cli/PortHints.js";
import {
  detectPublicIpv4FromInterfaces,
  resolveConsolePublicUrl,
} from "../../bin/main/modules/cli/PublicAccess.js";

test("buildRuntimePortFacts explains the runtime API port", () => {
  assert.deepEqual(buildRuntimePortFacts(), [
    {
      label: "Port",
      value: "5314",
    },
    {
      label: "Usage",
      value: "Runtime API / service endpoints (health, service, task, plugin)",
    },
  ]);
});

test("buildConsolePortFacts explains the console UI port", () => {
  assert.deepEqual(buildConsolePortFacts("http://127.0.0.1:5315"), [
    {
      label: "URL",
      value: "http://127.0.0.1:5315",
    },
    {
      label: "Port",
      value: "5315",
    },
    {
      label: "Usage",
      value: "Console Web UI / control plane",
    },
  ]);
});

test("buildConsolePortFacts includes public url when provided", () => {
  assert.deepEqual(
    buildConsolePortFacts("http://127.0.0.1:5315", {
      publicUrl: "http://203.0.113.10:5315",
    }),
    [
      {
        label: "URL",
        value: "http://127.0.0.1:5315",
      },
      {
        label: "Public URL",
        value: "http://203.0.113.10:5315",
      },
      {
        label: "Port",
        value: "5315",
      },
      {
        label: "Usage",
        value: "Console Web UI / control plane",
      },
    ],
  );
});

test("resolveConsolePublicUrl prefers explicit DOWNCITY_PUBLIC_URL", () => {
  assert.equal(
    resolveConsolePublicUrl({
      bindHost: "0.0.0.0",
      port: 5315,
      publicMode: true,
      env: {
        DOWNCITY_PUBLIC_URL: "https://console.example.com",
      },
      detectedPublicIp: "203.0.113.10",
    }),
    "https://console.example.com",
  );
});

test("resolveConsolePublicUrl uses DOWNCITY_PUBLIC_HOST when provided", () => {
  assert.equal(
    resolveConsolePublicUrl({
      bindHost: "0.0.0.0",
      port: 5315,
      publicMode: true,
      env: {
        DOWNCITY_PUBLIC_HOST: "console.example.com",
      },
    }),
    "http://console.example.com:5315",
  );
});

test("detectPublicIpv4FromInterfaces skips private addresses", () => {
  assert.equal(
    detectPublicIpv4FromInterfaces({
      lo0: [
        {
          address: "127.0.0.1",
          family: "IPv4",
          internal: true,
        },
      ],
      eth0: [
        {
          address: "10.0.0.8",
          family: "IPv4",
          internal: false,
        },
        {
          address: "203.0.113.10",
          family: "IPv4",
          internal: false,
        },
      ],
    }),
    "203.0.113.10",
  );
});

test("resolveConsolePublicUrl falls back to detected public ip in public mode", () => {
  assert.equal(
    resolveConsolePublicUrl({
      bindHost: "0.0.0.0",
      port: 5315,
      publicMode: true,
      detectedPublicIp: "203.0.113.10",
    }),
    "http://203.0.113.10:5315",
  );
});
