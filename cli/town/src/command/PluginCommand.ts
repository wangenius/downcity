/**
 * `town plugin` 命令组。
 *
 * 关键点（中文）
 * - `town plugin` 提供 Agent 内部 plugin 目录入口。
 * - `list/info` 不依赖 agent，只展示内建 plugin 定义事实。
 * - Town 不承载 plugin 运行态；运行态归属于具体 agent。
 * - `action` 仍保留为高级入口，真正执行时依赖具体 agent 项目。
 */

import fs from "node:fs";
import type { Command } from "commander";
import prompts from "prompts";
import {
  listPluginViews,
  listPluginsWithLifecycle,
  listPluginsWithoutLifecycle,
  runLocalPluginAction,
} from "@downcity/agent";
import {
  CHAT_AUTHORIZATION_PLUGIN_NAME,
  createBuiltinPlugins,
} from "@downcity/plugins";
import { printResult } from "../utils/cli/CliOutput.js";
import type { JsonValue } from "@downcity/agent";
import { getDowncityJsonPath } from "../config/Paths.js";
import type { PluginCliBaseOptions } from "@downcity/agent";
import { emitCliBlock } from "../shared/CliReporter.js";
import { parseBoolean, parsePort } from "../shared/IndexSupport.js";
import { resolveProjectRoot } from "../shared/PluginTargetSupport.js";
import { runManagedPluginCommandBridge } from "../shared/ManagedPluginRemote.js";
import { registerPluginScheduleCommands } from "./PluginScheduleCommand.js";

type StaticCatalogEntry = {
  name: string;
  title: string;
  kind: "agent-runtime" | "action";
  actionCount: number;
  actions: string[];
  hasSystem: boolean;
  note?: string;
};

const CHAT_RUNTIME_ACTIONS_HIDDEN_FROM_TOWN = new Set([
  "status",
  "test",
  "reconnect",
  "open",
  "close",
  "configuration",
  "configure",
]);

function createPluginCatalog() {
  return createBuiltinPlugins();
}

function isVisibleCatalogPlugin(pluginName: string): boolean {
  return pluginName !== CHAT_AUTHORIZATION_PLUGIN_NAME;
}

function createVisiblePluginCatalog() {
  return createPluginCatalog().filter((plugin) => isVisibleCatalogPlugin(plugin.name));
}

function listVisiblePluginActions(pluginName: string, actions: string[]): string[] {
  if (pluginName !== "chat") {
    return actions;
  }
  // 关键点（中文）：Town 只展示 chat plugin 的用户操作能力，不展示 platform 运行态控制。
  return actions.filter((action) => !CHAT_RUNTIME_ACTIONS_HIDDEN_FROM_TOWN.has(action));
}

async function resolvePluginProjectRoot(options: PluginCliBaseOptions): Promise<{
  projectRoot?: string;
  error?: string;
}> {
  return { projectRoot: resolveProjectRoot(options.path) };
}

function validatePluginProjectRoot(projectRoot: string): string | null {
  const downcityJsonPath = getDowncityJsonPath(projectRoot);
  return fs.existsSync(downcityJsonPath)
    ? null
    : `Invalid plugin project path: ${projectRoot}. Missing: downcity.json`;
}

function parseCommandPayload(raw?: string): JsonValue | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

function stripAnsi(input: string): string {
  return String(input || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function truncateCell(input: string, width: number): string {
  const text = String(input || "");
  if (stripAnsi(text).length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function renderPluginCatalogTable(rows: Array<{
  name: string;
  title: string;
  kind: "agent-runtime" | "action";
  actionCount: number;
  hasSystem: boolean;
}>): void {
  if (rows.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "Plugin catalog",
      summary: "0 plugins",
    });
    return;
  }

  const headers = ["plugin", "kind", "actions", "system", "title"] as const;
  const dataRows = rows.map((row) => [
    row.name,
    row.kind,
    String(row.actionCount),
    row.hasSystem ? "yes" : "no",
    row.title,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...dataRows.map((row) => stripAnsi(String(row[index] || "")).length),
    ),
  );
  widths[4] = Math.min(Math.max(widths[4], 16), 44);

  const renderRow = (values: string[]): string =>
    values
      .map((value, index) => truncateCell(value, widths[index]).padEnd(widths[index], " "))
      .join("  ");

  console.log(renderRow([...headers]));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of dataRows) {
    console.log(renderRow(row));
  }
}

function listStaticCatalogEntries(): StaticCatalogEntry[] {
  const plugins = createVisiblePluginCatalog();
  const managedEntries = listPluginsWithLifecycle(plugins).map((plugin) => {
    const actions = listVisiblePluginActions(
      plugin.name,
      Object.keys(plugin.actions || {}).sort((left, right) => left.localeCompare(right)),
    );
    return {
      name: plugin.name,
      title: String(plugin.title || plugin.name || "").trim() || plugin.name,
      kind: "agent-runtime" as const,
      actionCount: actions.length,
      actions,
      hasSystem: typeof plugin.system === "function",
      note: "Runs inside an agent. Town only shows the catalog here; runtime is owned by the agent process.",
    };
  });

  const localPlugins = listPluginsWithoutLifecycle(plugins);
  const localEntries = listPluginViews(localPlugins).map((plugin) => {
    return {
      name: plugin.name,
      title: plugin.title,
      kind: "action" as const,
      actionCount: plugin.actions.length,
      actions: [...plugin.actions],
      hasSystem: plugin.hasSystem,
      note: "Action/system plugin. It runs through agent/plugin action execution, not Town runtime.",
    };
  });

  const merged = [...managedEntries, ...localEntries];
  const unique = new Map<string, StaticCatalogEntry>();
  for (const entry of merged) {
    if (!unique.has(entry.name)) {
      unique.set(entry.name, entry);
    }
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function findStaticCatalogEntry(pluginName: string): StaticCatalogEntry | null {
  return listStaticCatalogEntries().find((item) => item.name === pluginName) || null;
}

async function promptPluginName(message: string): Promise<string | null> {
  const plugins = listStaticCatalogEntries();
  const response = (await prompts({
    type: "select",
    name: "pluginName",
    message,
    choices: plugins.map((plugin) => ({
      title: plugin.name,
      description: plugin.title || plugin.note || "",
      value: plugin.name,
    })),
    initial: 0,
  })) as { pluginName?: string };
  const pluginName = String(response.pluginName || "").trim();
  return pluginName || null;
}

async function promptPluginRootAction(): Promise<
  "catalog" | "info" | "exit" | null
> {
  const plugins = listStaticCatalogEntries();
  const response = (await prompts({
    type: "select",
    name: "action",
    message: "Plugin 配置",
    choices: [
      {
        title: "配置 plugin 能力",
        description: `${plugins.length} 个 Agent 可用 plugin`,
        value: "catalog",
      },
      {
        title: "查看 plugin 配置详情",
        description: "查看 actions、system 与运行边界配置",
        value: "info",
      },
      {
        title: "退出",
        description: "关闭 plugin manager",
        value: "exit",
      },
    ],
    initial: 0,
  })) as { action?: "catalog" | "info" | "exit" };

  return response.action || null;
}

async function resolveInteractivePluginName(params: {
  pluginName?: string;
  message: string;
}): Promise<string | null> {
  const explicit = String(params.pluginName || "").trim();
  if (explicit) return explicit;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emitCliBlock({
      tone: "error",
      title: "Plugin name is required",
      note: "Use `town plugin info <pluginName>` or run this command in an interactive terminal.",
    });
    return null;
  }

  const selected = await promptPluginName(params.message);
  if (!selected) {
    emitCliBlock({
      tone: "info",
      title: "Plugin selection cancelled",
    });
    return null;
  }
  return selected;
}

async function runPluginListCommand(options: { json?: boolean }): Promise<void> {
  const plugins = listStaticCatalogEntries();
  if (options.json !== true) {
    renderPluginCatalogTable(
      plugins.map((plugin) => ({
        name: plugin.name,
        title: plugin.title,
        kind: plugin.kind,
        actionCount: plugin.actionCount,
        hasSystem: plugin.hasSystem,
      })),
    );
    return;
  }
  printResult({
    asJson: true,
    success: true,
    title: "plugins listed",
    payload: {
      plugins,
    },
  });
}

async function runPluginInfoCommand(params: {
  pluginName?: string;
  options: { json?: boolean };
}): Promise<void> {
  const pluginName = await resolveInteractivePluginName({
    pluginName: params.pluginName,
    message: "选择要查看的 plugin",
  });
  if (!pluginName) {
    return;
  }

  const plugin = findStaticCatalogEntry(pluginName);
  if (!plugin) {
    printResult({
      asJson: params.options.json === true,
      success: false,
      title: "plugin info failed",
      payload: {
        error: `Unknown plugin: ${pluginName}`,
      },
    });
    return;
  }

  if (params.options.json !== true) {
    emitCliBlock({
      tone: "info",
      title: `Plugin ${pluginName}`,
      summary: plugin.kind,
      facts: [
        {
          label: "title",
          value: plugin.title || pluginName,
        },
        {
          label: "kind",
          value: plugin.kind,
        },
        {
          label: "actions",
          value: plugin.actions.join(", ") || "none",
        },
        {
          label: "system",
          value: plugin.hasSystem ? "yes" : "no",
        },
        ...(plugin.note
          ? [
              {
                label: "note",
                value: plugin.note,
              },
            ]
          : []),
      ],
    });
    return;
  }

  printResult({
    asJson: true,
    success: true,
    title: "plugin info ok",
    payload: {
      pluginName,
      plugin,
    },
  });
}

export async function runInteractivePluginManager(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return;
  }

  while (true) {
    const action = await promptPluginRootAction();
    if (!action || action === "exit") {
      emitCliBlock({
        tone: "info",
        title: "Plugin manager closed",
      });
      return;
    }

    try {
      if (action === "catalog") {
        await runPluginListCommand({
          json: false,
        });
        continue;
      }
      if (action === "info") {
        await runPluginInfoCommand({
          options: {
            json: false,
          },
        });
      }
    } catch (error) {
      emitCliBlock({
        tone: "error",
        title: "Plugin manager action failed",
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function runPluginActionCommand(params: {
  pluginName: string;
  actionName: string;
  payload?: string;
  options: PluginCliBaseOptions;
}): Promise<void> {
  const resolved = await resolvePluginProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "plugin action failed",
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }

  const pluginPathError = validatePluginProjectRoot(resolved.projectRoot);
  if (pluginPathError) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "plugin action failed",
      payload: {
        error: pluginPathError || `Invalid plugin project path: ${resolved.projectRoot}. Missing: downcity.json`,
      },
    });
    return;
  }

  const payload = parseCommandPayload(params.payload);
  const local = await runLocalPluginAction({
    plugins: createPluginCatalog(),
    projectRoot: resolved.projectRoot,
    pluginName: params.pluginName,
    actionName: params.actionName,
    ...(payload !== undefined ? { payload } : {}),
  });
  printResult({
    asJson: params.options.json,
    success: Boolean(local.success),
    title: local.success ? "plugin action ok" : "plugin action failed",
    payload: {
      pluginName: params.pluginName,
      actionName: params.actionName,
      ...(local.data !== undefined ? { data: local.data } : {}),
      ...(local.message ? { message: local.message } : {}),
      ...(local.error ? { error: local.error } : {}),
    },
  });
}

/**
 * 注册 `town plugin` 命令组。
 */
export function registerPluginsCommand(program: Command): void {
  const plugin = program
    .command("plugin")
    .description("管理 plugin（无参数时启动交互式管理器）")
    .helpOption("--help", "display help for command");

  plugin.action(async () => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      plugin.outputHelp();
      return;
    }
    await runInteractivePluginManager();
  });

  plugin
    .command("list")
    .description("列出全部已注册 plugin 的静态信息")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action(async (opts: { json?: boolean }) => {
      await runPluginListCommand(opts);
    });

  plugin
    .command("info [pluginName]")
    .description("查看单个 plugin 的静态信息")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action(async (pluginName: string | undefined, opts: { json?: boolean }) => {
      await runPluginInfoCommand({
        pluginName,
        options: opts,
      });
    });

  plugin
    .command("command <pluginName> <command>")
    .description("按 agent 目标转发托管 plugin command")
    .option("--payload <json>", "可选 payload（JSON 字符串或普通字符串）")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <id>", "agent id（从 managed agent registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePort)
    .option("--token <token>", "覆盖 Bearer Token（按 Town Agent HTTP gateway 调用时可选）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean, true)
    .action(async (
      pluginName: string,
      command: string,
      opts: PluginCliBaseOptions & { payload?: string },
    ) => {
      await runManagedPluginCommandBridge({
        pluginName,
        command,
        payloadRaw: opts.payload,
        options: opts,
      });
    });

  plugin
    .command("action <pluginName> <actionName>")
    .description("运行 plugin action（在当前本地项目内直接执行）")
    .option("--payload <json>", "Action payload（JSON 或普通字符串）")
    .option("--path <path>", "agent 项目路径（默认当前目录）", ".")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean, true)
    .action(
      async (
        pluginName: string,
        actionName: string,
        opts: PluginCliBaseOptions & { payload?: string },
      ) => {
        await runPluginActionCommand({
          pluginName,
          actionName,
          payload: opts.payload,
          options: opts,
        });
      },
    );

  registerPluginScheduleCommands(plugin);
}
