/**
 * PluginRegistry activation 测试（node:test）。
 *
 * 关键点（中文）
 * - plugin enablement 不应只影响 hook / system，也应影响显式 action 调用。
 * - disabled plugin 必须在 registry 层被拦截，避免 action 自己各写一套判断。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { HookRegistry } from "../../bin/console/plugin/HookRegistry.js";
import { PluginRegistry } from "../../bin/console/plugin/PluginRegistry.js";
import { isPluginEnabledInConfig } from "../../bin/console/plugin/Activation.js";

function createRuntime(config = {}) {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-plugin-registry-"));
  return {
    rootPath,
    cwd: ".",
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      log() {},
    },
    config: {
      name: "demo",
      version: "1.0.0",
      model: {
        primary: "default",
      },
      plugins: {},
      assets: {},
      ...config,
    },
    env: {},
    systems: [],
    session: {},
    services: {
      async invoke() {
        return { success: false, error: "unused" };
      },
    },
    assets: {
      list() {
        return [];
      },
      async check() {
        return { available: true, reasons: [] };
      },
      async install() {
        return { success: true, message: "ok" };
      },
      async use() {
        return {};
      },
      async getConfig() {
        return null;
      },
      async setConfig() {
        return {};
      },
    },
    plugins: {
      list() {
        return [];
      },
      async availability() {
        return {
          enabled: true,
          available: true,
          reasons: [],
          missingAssets: [],
        };
      },
      async runAction() {
        return {
          success: false,
          error: "unused",
          message: "unused",
        };
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
  };
}

function createRegistry(runtime) {
  let currentRuntime = runtime;
  const assetRegistry = {
    async check() {
      return {
        available: true,
        reasons: [],
      };
    },
  };
  const hookRegistry = new HookRegistry({
    runtimeResolver: () => currentRuntime,
    pluginEnabledChecker: (pluginName, pluginRuntime) => {
      const plugin = pluginRegistry.get(pluginName);
      if (!plugin) return false;
      return isPluginEnabledInConfig({
        plugin,
        config: pluginRuntime.config,
      });
    },
  });
  const pluginRegistry = new PluginRegistry({
    runtimeResolver: () => currentRuntime,
    hookRegistry,
    assetRegistry,
  });
  return {
    pluginRegistry,
    setRuntime(nextRuntime) {
      currentRuntime = nextRuntime;
    },
  };
}

test("plugin registry blocks actions for disabled plugins", async () => {
  const runtime = createRuntime();
  const { pluginRegistry } = createRegistry(runtime);

  pluginRegistry.register({
    name: "demo",
    title: "Demo",
    description: "demo plugin",
    config: {
      plugin: "demo",
      scope: "project",
      defaultValue: {
        enabled: false,
      },
    },
    actions: {
      ping: {
        async execute() {
          return {
            success: true,
            data: {
              ok: true,
            },
          };
        },
      },
    },
  });

  const result = await pluginRegistry.runAction({
    plugin: "demo",
    action: "ping",
  });

  assert.equal(result.success, false);
  assert.match(String(result.error || ""), /disabled/i);
});

test("plugin registry still allows actions for enabled plugins", async () => {
  const runtime = createRuntime({
    plugins: {
      demo: {
        enabled: true,
      },
    },
  });
  const { pluginRegistry } = createRegistry(runtime);

  pluginRegistry.register({
    name: "demo",
    title: "Demo",
    description: "demo plugin",
    config: {
      plugin: "demo",
      scope: "project",
      defaultValue: {
        enabled: false,
      },
    },
    actions: {
      ping: {
        async execute() {
          return {
            success: true,
            data: {
              ok: true,
            },
          };
        },
      },
    },
  });

  const result = await pluginRegistry.runAction({
    plugin: "demo",
    action: "ping",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { ok: true });
});
