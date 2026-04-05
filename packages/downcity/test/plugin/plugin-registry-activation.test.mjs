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
import { HookRegistry } from "../../bin/main/plugin/HookRegistry.js";
import { PluginRegistry } from "../../bin/main/plugin/PluginRegistry.js";
import { isPluginEnabled } from "../../bin/main/plugin/Activation.js";
import {
  setCityPluginEnabled,
  writeCityPluginLifecycleConfig,
} from "../../bin/main/plugin/Lifecycle.js";

process.env.DC_CONSOLE_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "downcity-test-console-plugin-registry-"),
);

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
    plugins: {
      list() {
        return [];
      },
      async availability() {
        return {
          enabled: true,
          available: true,
          reasons: [],
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
    contextResolver: () => currentRuntime,
    pluginEnabledChecker: (pluginName, context) => {
      const plugin = pluginRegistry.get(pluginName);
      if (!plugin) return false;
      return isPluginEnabled({ plugin });
    },
  });
  const pluginRegistry = new PluginRegistry({
    contextResolver: () => currentRuntime,
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
  writeCityPluginLifecycleConfig({});
  const runtime = createRuntime();
  const { pluginRegistry } = createRegistry(runtime);

  pluginRegistry.register({
    name: "demo-disabled",
    title: "Demo",
    description: "demo plugin",
    config: {
      plugin: "demo-disabled",
      scope: "project",
      defaultValue: {
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
  setCityPluginEnabled("demo-disabled", false);

  const result = await pluginRegistry.runAction({
    plugin: "demo-disabled",
    action: "ping",
  });

  assert.equal(result.success, false);
  assert.match(String(result.error || ""), /disabled/i);
});

test("plugin registry still allows actions for enabled plugins", async () => {
  writeCityPluginLifecycleConfig({});
  const runtime = createRuntime();
  const { pluginRegistry } = createRegistry(runtime);

  pluginRegistry.register({
    name: "demo-enabled",
    title: "Demo",
    description: "demo plugin",
    config: {
      plugin: "demo-enabled",
      scope: "project",
      defaultValue: {
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
  setCityPluginEnabled("demo-enabled", true);

  const result = await pluginRegistry.runAction({
    plugin: "demo-enabled",
    action: "ping",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { ok: true });
});

test("plugin registry allows opted-in setup actions for disabled plugins", async () => {
  writeCityPluginLifecycleConfig({});
  const runtime = createRuntime();
  const { pluginRegistry } = createRegistry(runtime);

  pluginRegistry.register({
    name: "demo-setup-disabled",
    title: "Demo",
    description: "demo plugin",
    config: {
      plugin: "demo-setup-disabled",
      scope: "project",
      defaultValue: {
      },
    },
    actions: {
      on: {
        allowWhenDisabled: true,
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
  setCityPluginEnabled("demo-setup-disabled", false);

  const result = await pluginRegistry.runAction({
    plugin: "demo-setup-disabled",
    action: "on",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { ok: true });
});

test("plugin view no longer exposes requiredAssets metadata", async () => {
  const runtime = createRuntime();
  const { pluginRegistry } = createRegistry(runtime);

  pluginRegistry.register({
    name: "demo",
    title: "Demo",
    description: "demo plugin",
    actions: {},
  });

  const views = pluginRegistry.list();
  assert.equal("requiredAssets" in views[0], false);
});
