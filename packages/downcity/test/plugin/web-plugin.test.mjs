/**
 * Web Plugin 测试（node:test）。
 *
 * 关键点（中文）
 * - `web` plugin 现在是薄适配层：选择 provider、检查 provider、注入 provider prompt。
 * - 不再在本项目里自实现 web-access / agent-browser 的核心能力。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Command } from "commander";
import { webPlugin } from "../../bin/plugins/web/Plugin.js";
import { PLUGINS } from "../../bin/main/plugin/Plugins.js";
import { registerAllPluginsForCli } from "../../bin/main/plugin/PluginCommand.js";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    log() {},
  };
}

function createHost(rootPath) {
  return {
    globalEnv: {},
    paths: {
      projectRoot: rootPath,
      getDowncityDirPath: () => path.join(rootPath, ".downcity"),
      getCacheDirPath: () => path.join(rootPath, ".downcity", ".cache"),
      getDowncityChannelDirPath: () => path.join(rootPath, ".downcity", "channel"),
      getDowncityChannelMetaPath: () => path.join(rootPath, ".downcity", "channel", "meta.json"),
      getDowncityChatHistoryPath: (sessionId) =>
        path.join(rootPath, ".downcity", "chat", sessionId, "history.jsonl"),
      getDowncityMemoryIndexPath: () => path.join(rootPath, ".downcity", "memory", "index.sqlite"),
      getDowncityMemoryLongTermPath: () => path.join(rootPath, ".downcity", "memory", "MEMORY.md"),
      getDowncityMemoryDailyDirPath: () => path.join(rootPath, ".downcity", "memory", "daily"),
      getDowncityMemoryDailyPath: (date) =>
        path.join(rootPath, ".downcity", "memory", "daily", `${date}.md`),
      getDowncitySessionRootDirPath: () => path.join(rootPath, ".downcity", "session"),
      getDowncitySessionDirPath: (sessionId) =>
        path.join(rootPath, ".downcity", "session", sessionId),
    },
    auth: {
      applyInternalAgentAuthEnv() {},
    },
    pluginConfig: {
      async persistProjectPlugins() {
        return path.join(rootPath, "downcity.json");
      },
    },
  };
}

function createRuntime() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-web-plugin-"));
  fs.writeFileSync(
    path.join(rootPath, "downcity.json"),
    `${JSON.stringify(
      {
        name: "demo",
        version: "1.0.0",
        model: {
          primary: "demo-model",
        },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  return {
    rootPath,
    runtime: {
      cwd: ".",
      rootPath,
      logger: createLogger(),
      config: {
        name: "demo",
        version: "1.0.0",
        model: {
          primary: "demo-model",
        },
        plugins: {},
      },
      env: {},
      ...createHost(rootPath),
      systems: [],
      context: {},
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
    },
  };
}

test("web plugin configure action writes provider config into plugins.web", async () => {
  const { runtime } = createRuntime();

  const result = await webPlugin.actions.configure.execute({
    context: runtime,
    payload: {
      enabled: true,
      provider: "agent-browser",
      injectPrompt: false,
      browserCommand: "node",
    },
    pluginName: "web",
    actionName: "configure",
  });

  assert.equal(result.success, true);
  assert.equal(runtime.config.plugins.web.enabled, true);
  assert.equal(runtime.config.plugins.web.provider, "agent-browser");
  assert.equal(runtime.config.plugins.web.injectPrompt, false);
  assert.equal(runtime.config.plugins.web.browserCommand, "node");
});

test("web plugin providers action exposes both provider options", async () => {
  const result = await webPlugin.actions.providers.execute({
    context: createRuntime().runtime,
    payload: {},
    pluginName: "web",
    actionName: "providers",
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data.providers.map((item) => item.value),
    ["web-access", "agent-browser"],
  );
});

test("web plugin status reports missing web-access dependency by default", async () => {
  const { runtime } = createRuntime();
  const originalHome = process.env.HOME;
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-web-missing-home-"));
  process.env.HOME = isolatedHome;

  try {
    const result = await webPlugin.actions.status.execute({
      context: runtime,
      payload: {},
      pluginName: "web",
      actionName: "status",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.plugin.provider, "web-access");
    assert.equal(result.data.availability.enabled, true);
    assert.equal(result.data.availability.available, false);
    assert.match(String(result.data.availability.reasons[0] || ""), /web-access skill is not found/i);
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(isolatedHome, { recursive: true, force: true });
  }
});

test("web plugin doctor passes for agent-browser when command exists", async () => {
  const { runtime } = createRuntime();
  await webPlugin.actions.use.execute({
    context: runtime,
    payload: {
      provider: "agent-browser",
      browserCommand: "node",
    },
    pluginName: "web",
    actionName: "use",
  });

  const result = await webPlugin.actions.doctor.execute({
    context: runtime,
    payload: {},
    pluginName: "web",
    actionName: "doctor",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.availability.available, true);
  assert.equal(result.data.provider.browserCommand, "node");
});

test("web plugin system prompt switches with provider", async () => {
  const { runtime } = createRuntime();

  await webPlugin.actions.use.execute({
    context: runtime,
    payload: {
      provider: "agent-browser",
      browserCommand: "agent-browser",
    },
    pluginName: "web",
    actionName: "use",
  });

  const prompt = await webPlugin.system(runtime);
  assert.match(prompt, /Current web provider: agent-browser/);
  assert.match(prompt, /open/);
  assert.match(prompt, /snapshot -i/);
});

test("web plugin use action switches provider", async () => {
  const { runtime } = createRuntime();

  const result = await webPlugin.actions.use.execute({
    context: runtime,
    payload: {
      provider: "agent-browser",
      browserCommand: "node",
    },
    pluginName: "web",
    actionName: "use",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.plugin.provider, "agent-browser");
});

test("web plugin status passes when project-local web-access skill exists", async () => {
  const { runtime, rootPath } = createRuntime();
  const skillPath = path.join(rootPath, ".agents", "skills", "web-access");
  fs.mkdirSync(skillPath, { recursive: true });
  fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Web Access\n", "utf-8");

  const result = await webPlugin.actions.status.execute({
    context: runtime,
    payload: {},
    pluginName: "web",
    actionName: "status",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.availability.available, true);
  assert.equal(result.data.provider.skillPath.endsWith("SKILL.md"), true);
});

test("web plugin install copies local web-access skill into unified user skill root", async () => {
  const { runtime } = createRuntime();
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-web-home-"));
  const localSkillSource = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-web-access-src-"));
  fs.writeFileSync(path.join(localSkillSource, "SKILL.md"), "# Web Access Local\n", "utf-8");

  const originalHome = process.env.HOME;
  process.env.HOME = fakeHome;

  try {
    const result = await webPlugin.actions.install.execute({
      context: runtime,
      payload: {
        provider: "web-access",
        repositoryUrl: localSkillSource,
        installScope: "user",
      },
      pluginName: "web",
      actionName: "install",
    });

    assert.equal(result.success, true);
    const installedSkillPath = path.join(
      fakeHome,
      ".agents",
      "skills",
      "web-access",
      "SKILL.md",
    );
    assert.equal(fs.existsSync(installedSkillPath), true);
    assert.match(fs.readFileSync(installedSkillPath, "utf-8"), /Web Access Local/);
    assert.equal(runtime.config.plugins.web.installScope, "user");
  } finally {
    process.env.HOME = originalHome;
  }
});

test("web plugin install writes agent-browser bridge skill into unified project skill root", async () => {
  const { runtime, rootPath } = createRuntime();

  const result = await webPlugin.actions.install.execute({
    context: runtime,
    payload: {
      provider: "agent-browser",
      installScope: "project",
    },
    pluginName: "web",
    actionName: "install",
  });

  assert.equal(result.success, true);
  const installedSkillPath = path.join(
    rootPath,
    ".agents",
    "skills",
    "agent-browser",
    "SKILL.md",
  );
  assert.equal(fs.existsSync(installedSkillPath), true);
  assert.match(fs.readFileSync(installedSkillPath, "utf-8"), /agent-browser/i);
  assert.equal(runtime.config.plugins.web.installScope, "project");
});

test("builtin plugins and CLI expose web", () => {
  const pluginNames = PLUGINS.map((plugin) => plugin.name).sort();
  assert.equal(pluginNames.includes("web"), true);

  const program = new Command();
  registerAllPluginsForCli(program);
  const commandNames = program.commands.map((command) => command.name()).sort();
  assert.equal(commandNames.includes("web"), true);
});
