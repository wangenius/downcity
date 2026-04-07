/**
 * PluginManager city runtime 注入测试（node:test）。
 *
 * 关键点（中文）
 * - PluginManager 不应直接反向依赖 agent AgentContext 单例。
 * - 当前上下文应通过 city runtime 级 resolver 显式注入。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  clearPluginRuntimeContextResolver,
  setPluginRuntimeContextResolver,
} from "../../bin/main/city/runtime/PluginRuntime.js";
import {
  setCityPluginEnabled,
  writeCityPluginLifecycleConfig,
} from "../../bin/main/plugin/Lifecycle.js";
import {
  initializePluginManager,
  resetPluginManager,
} from "../../bin/main/plugin/PluginManager.js";

process.env.DC_CONSOLE_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "downcity-test-console-plugin-manager-"),
);

function createContext(config) {
  return {
    cwd: ".",
    rootPath: "/tmp/downcity-plugin-runtime",
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      action() {},
      log() {},
    },
    config,
    env: {},
    globalEnv: {},
    systems: [],
    paths: {
      projectRoot: "/tmp/downcity-plugin-runtime",
    },
    pluginConfig: {
      async persistProjectPlugins() {
        return "";
      },
    },
    session: {
      get() {
        return {
          sessionId: "plugin-runtime",
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
            return Promise.resolve();
          },
          appendAssistantMessage() {
            return Promise.resolve();
          },
          isExecuting() {
            return false;
          },
        };
      },
    },
    invoke: {
      async invoke() {
        return { success: false, error: "unused" };
      },
    },
    chat: {
      async readMetaBySessionId() {
        return null;
      },
      async appendExecSessionMessage() {},
      enqueue() {
        throw new Error("unused");
      },
    },
    plugins: {
      list() {
        return [];
      },
      async availability() {
        return { enabled: true, available: true, reasons: [] };
      },
      async runAction() {
        return { success: false, error: "unused", message: "unused" };
      },
      async pipeline(_pointName, value) {
        return value;
      },
      async guard() {},
      async effect() {},
      async resolve() {
        return {};
      },
    },
    agent: {
      cwd: ".",
      rootPath: "/tmp/downcity-plugin-runtime",
      logger: {
        info() {},
        warn() {},
        error() {},
        debug() {},
        action() {},
        log() {},
      },
      config,
      env: {},
      globalEnv: {},
      systems: [],
      paths: {
        projectRoot: "/tmp/downcity-plugin-runtime",
      },
      pluginConfig: {
        async persistProjectPlugins() {
          return "";
        },
      },
      getSession() {
        return {
          sessionId: "plugin-test",
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
            return Promise.resolve();
          },
          appendAssistantMessage() {
            return Promise.resolve();
          },
          isExecuting() {
            return false;
          },
        };
      },
      listExecutingSessionIds() {
        return [];
      },
      getExecutingSessionCount() {
        return 0;
      },
      services: new Map(),
    },
  };
}

test("plugin manager uses city runtime context resolver", async () => {
  resetPluginManager();
  clearPluginRuntimeContextResolver();
  writeCityPluginLifecycleConfig({});

  let currentContext = createContext({
    name: "demo",
    version: "1.0.0",
    execution: {
      type: "model",
      modelId: "demo",
    },
    plugins: {},
  });

  setCityPluginEnabled("asr", false);
  setPluginRuntimeContextResolver(() => currentContext);
  const pluginManager = initializePluginManager();

  const disabled = await pluginManager.availability("asr");
  assert.equal(disabled.enabled, false);

  currentContext = createContext({
    name: "demo",
    version: "1.0.0",
    execution: {
      type: "model",
      modelId: "demo",
    },
    plugins: {
      asr: {
        provider: "command",
        command: "printf 'ok\\n'",
      },
    },
  });

  setCityPluginEnabled("asr", true);
  const enabled = await pluginManager.availability("asr");
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.available, true);

  clearPluginRuntimeContextResolver();
  resetPluginManager();
});
