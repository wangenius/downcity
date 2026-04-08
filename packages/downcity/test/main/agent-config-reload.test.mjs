/**
 * Agent 项目配置热刷新测试（node:test）。
 *
 * 关键点（中文）
 * - 运行中的 agent 应能刷新 downcity.json 配置快照。
 * - plugin 启用态变更后，不应强依赖重启进程才能被 AgentContext 读到。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getAgentRuntime,
  refreshAgentProjectConfig,
  setAgentRuntime,
  stopAgentHotReload,
} from "../../bin/main/agent/AgentRuntime.js";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    action() {},
    log() {},
  };
}

function createSessionStub() {
  return {
    sessionId: "chat-1",
    getExecutor() {
      return null;
    },
    getHistoryComposer() {
      return null;
    },
    run() {
      throw new Error("unused");
    },
    clearExecutor() {},
    afterSessionUpdatedAsync() {
      return Promise.resolve();
    },
    appendUserMessage() {
      return Promise.resolve(null);
    },
    appendAssistantMessage() {
      return Promise.resolve(null);
    },
    isExecuting() {
      return false;
    },
  };
}

function writeConfig(projectRoot, injectPrompt) {
  fs.writeFileSync(
    path.join(projectRoot, "downcity.json"),
    `${JSON.stringify(
      {
        name: "demo-agent",
        version: "1.0.0",
        execution: {
          type: "api",
          modelId: "demo-model",
        },
        plugins: {
          asr: {
            injectPrompt,
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

test("refreshAgentProjectConfig updates runtime plugin config after downcity.json changes", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-agent-config-"));
  const consoleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-agent-config-console-"));
  const previousConsoleRoot = process.env.DC_CONSOLE_ROOT;
  process.env.DC_CONSOLE_ROOT = consoleRoot;
  writeConfig(projectRoot, false);

  try {
    setAgentRuntime({
      cwd: projectRoot,
      rootPath: projectRoot,
      logger: createLogger(),
      config: {
        name: "demo-agent",
        version: "1.0.0",
        execution: {
          type: "api",
          modelId: "demo-model",
        },
        plugins: {
          asr: {
            injectPrompt: false,
          },
        },
      },
      env: {},
      globalEnv: {},
      systems: [],
      getSession() {
        return createSessionStub();
      },
      listExecutingSessionIds() {
        return [];
      },
      getExecutingSessionCount() {
        return 0;
      },
      services: new Map(),
    });

    writeConfig(projectRoot, true);

    const changed = refreshAgentProjectConfig();

    assert.equal(changed, true);
    assert.equal(getAgentRuntime().config.plugins?.asr?.injectPrompt, true);
    assert.equal(refreshAgentProjectConfig(), false);
  } finally {
    stopAgentHotReload();
    if (previousConsoleRoot === undefined) delete process.env.DC_CONSOLE_ROOT;
    else process.env.DC_CONSOLE_ROOT = previousConsoleRoot;
    fs.rmSync(consoleRoot, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
