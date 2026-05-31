/**
 * `town plugin` 命令组。
 *
 * 关键点（中文）
 * - `town plugin` 提供 console 侧静态 plugin catalog 入口。
 * - `list/status` 不依赖 agent，只展示内建 plugin 定义与 Town 配置事实。
 * - `action` 仍保留为高级入口，真正执行时依赖具体 agent 项目。
 */

import path from "node:path";
import fs from "node:fs";
import type { Command } from "commander";
import prompts from "prompts";
import {
  buildStaticPluginAvailability,
  findPluginByName,
  listPluginViews,
  listPluginsWithLifecycle,
  listPluginsWithoutLifecycle,
  runLocalPluginAction,
} from "@downcity/agent";
import { createBuiltinPlugins } from "@downcity/plugins";
import { printResult } from "@/utils/cli/CliOutput.js";
import type { JsonValue } from "@downcity/agent";
import { getDowncityJsonPath } from "@/config/Paths.js";
import type { PluginCliBaseOptions } from "@downcity/agent";
import { emitCliBlock } from "./CliReporter.js";
import { parseBoolean, parsePort } from "./IndexSupport.js";
import { resolveProjectRoot } from "./PluginTargetSupport.js";
import {
  runManagedPluginCommandBridge,
  runManagedPluginControlCommand,
} from "./ManagedPluginRemote.js";
import { registerPluginScheduleCommands } from "./PluginScheduleCommand.js";
import { setBayPluginEnabled } from "@/platform/PluginLifecycle.js";

type StaticCatalogEntry = {
  name: string;
  title: string;
  kind: "managed" | "local";
  enabled: boolean;
  available: boolean;
  actionCount: number;
  actions: string[];
  hasSystem: boolean;
  note?: string;
};

function createPluginCatalog() {
  return createBuiltinPlugins();
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

function buildSafeStaticPluginAvailability(pluginName: string): {
  enabled: boolean;
  available: boolean;
  reasons: string[];
} {
  try {
    const availability = buildStaticPluginAvailability({
      plugins: createPluginCatalog(),
      pluginName,
    });
    const normalizedReasons = availability.reasons.map((reason) => {
      const text = String(reason || "");
      if (
        text.includes("readonly")
        || text.includes("Static availability inspection failed")
      ) {
        return "Static catalog view only. Console plugin availability could not be resolved in the current environment.";
      }
      return text;
    });
    return {
      ...availability,
      reasons: normalizedReasons,
    };
  } catch (error) {
    const message = String(error || "");
    return {
      enabled: false,
      available: false,
      reasons: [
        message.includes("readonly")
          ? "Static catalog view only. Console plugin config is not writable in the current environment."
          : "Static catalog view only. Console plugin availability could not be resolved.",
      ],
    };
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
  kind: "managed" | "local";
  enabled: boolean;
  available: boolean;
  actionCount: number;
}>): void {
  if (rows.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "Plugin catalog",
      summary: "0 plugins",
    });
    return;
  }

  const headers = ["plugin", "kind", "enabled", "available", "actions", "title"] as const;
  const dataRows = rows.map((row) => [
    row.name,
    row.kind,
    row.enabled ? "on" : "off",
    row.available ? "yes" : "no",
    String(row.actionCount),
    row.title,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...dataRows.map((row) => stripAnsi(String(row[index] || "")).length),
    ),
  );
  widths[5] = Math.min(Math.max(widths[5], 16), 40);

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
  const plugins = createPluginCatalog();
  const managedEntries = listPluginsWithLifecycle(plugins).map((plugin) => ({
    name: plugin.name,
    title: String(plugin.title || plugin.name || "").trim() || plugin.name,
    kind: "managed" as const,
    enabled: true,
    available: true,
    actionCount: Object.keys(plugin.actions || {}).length,
    actions: Object.keys(plugin.actions || {}).sort((left, right) => left.localeCompare(right)),
    hasSystem: typeof plugin.system === "function",
    note: "Managed plugin. Use `town plugin start/stop/restart/status` with an agent target for live state.",
  }));

  const localPlugins = listPluginsWithoutLifecycle(plugins);
  const localEntries = listPluginViews(localPlugins)
    .map((plugin) => {
    const availability = buildSafeStaticPluginAvailability(plugin.name);
    return {
      name: plugin.name,
      title: plugin.title,
      kind: "local" as const,
      enabled: availability.enabled,
      available: availability.available,
      actionCount: plugin.actions.length,
      actions: [...plugin.actions],
      hasSystem: plugin.hasSystem,
      note: availability.reasons.join("; ") || undefined,
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

async function promptPluginManagerAction(params: {
  pluginName: string;
}): Promise<"status" | "enable" | "disable" | "back" | null> {
  const plugin = findStaticCatalogEntry(params.pluginName);
  const availability = plugin
    ? { enabled: plugin.enabled, available: plugin.available }
    : { enabled: false, available: false };
  const response = (await prompts({
    type: "select",
    name: "action",
    message: `管理 plugin · ${params.pluginName}`,
    choices: [
      {
        title: "查看信息",
        description: plugin?.title || params.pluginName,
        value: "status",
      },
      {
        title: "全局启用",
        description: availability.enabled ? "当前已启用" : "写入 Town 级 lifecycle 配置",
        value: "enable",
      },
      {
        title: "全局关闭",
        description:
          params.pluginName === "auth"
            ? "auth plugin 不允许全局关闭"
            : "写入 Town 级 lifecycle 配置",
        value: "disable",
      },
      {
        title: "返回",
        description: "重新选择 plugin",
        value: "back",
      },
    ],
    initial: 0,
  })) as { action?: "status" | "enable" | "disable" | "back" };

  const action = response.action;
  return action || null;
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
        enabled: plugin.enabled,
        available: plugin.available,
        actionCount: plugin.actionCount,
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
      title: "plugin status failed",
      payload: {
        error: `Unknown plugin: ${pluginName}`,
      },
    });
    return;
  }

  if (params.options.json !== true) {
    emitCliBlock({
      tone: plugin.available ? "success" : plugin.enabled ? "warning" : "info",
      title: `Plugin ${pluginName}`,
      summary: plugin.available ? "available" : plugin.enabled ? "static only" : "disabled",
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

function printPluginLifecycleResult(params: {
  pluginName: string;
  enabled: boolean;
}): void {
  emitCliBlock({
    tone: "success",
    title: `Plugin ${params.pluginName}`,
    summary: params.enabled ? "enabled" : "disabled",
    facts: [
      {
        label: "scope",
        value: "town",
      },
      {
        label: "mode",
        value: "global lifecycle",
      },
    ],
  });
}

async function runPluginLifecycleCommand(params: {
  pluginName: string;
  enabled: boolean;
  asJson?: boolean;
}): Promise<void> {
  const plugin = findPluginByName(createPluginCatalog(), params.pluginName);
  if (!plugin) {
    printResult({
      asJson: params.asJson === true,
      success: false,
      title: "plugin lifecycle failed",
      payload: {
        error: `Unknown plugin: ${params.pluginName}`,
      },
    });
    return;
  }

  if (plugin.name === "auth" && params.enabled === false) {
    printResult({
      asJson: params.asJson === true,
      success: false,
      title: "plugin lifecycle failed",
      payload: {
        pluginName: plugin.name,
        error: `Plugin "${plugin.name}" cannot be disabled globally`,
      },
    });
    return;
  }

  setBayPluginEnabled(plugin.name, params.enabled);
  if (params.asJson === true) {
    printResult({
      asJson: true,
      success: true,
      title: "plugin lifecycle updated",
      payload: {
        pluginName: plugin.name,
        enabled: params.enabled,
        scope: "town",
      },
    });
    return;
  }

  printPluginLifecycleResult({
    pluginName: plugin.name,
    enabled: params.enabled,
  });
}

async function runInteractivePluginManager(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return;
  }

  while (true) {
    const pluginName = await promptPluginName("选择要管理的 plugin");
    if (!pluginName) {
      emitCliBlock({
        tone: "info",
        title: "Plugin manager closed",
      });
      return;
    }

    while (true) {
      const action = await promptPluginManagerAction({
        pluginName,
      });
      if (!action) {
        emitCliBlock({
          tone: "info",
          title: "Plugin manager closed",
        });
        return;
      }
      if (action === "back") {
        break;
      }
      if (action === "status") {
        await runPluginInfoCommand({
          pluginName,
          options: {
            json: false,
          },
        });
        continue;
      }
      if (action === "enable") {
        await runPluginLifecycleCommand({
          pluginName,
          enabled: true,
        });
        continue;
      }
      if (action === "disable") {
        await runPluginLifecycleCommand({
          pluginName,
          enabled: false,
        });
      }
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
    .command("status <pluginName>")
    .description("按 agent 目标查看托管 plugin 运行状态")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <id>", "agent id（从 managed agent registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePort)
    .option("--token <token>", "覆盖 Bearer Token（按 HTTP daemon 调用时可选）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean, true)
    .action(async (pluginName: string, opts: PluginCliBaseOptions) => {
      await runManagedPluginControlCommand({
        pluginName,
        action: "status",
        options: opts,
      });
    });

  plugin
    .command("start <pluginName>")
    .description("按 agent 目标启动托管 plugin")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <id>", "agent id（从 managed agent registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePort)
    .option("--token <token>", "覆盖 Bearer Token（按 HTTP daemon 调用时可选）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean, true)
    .action(async (pluginName: string, opts: PluginCliBaseOptions) => {
      await runManagedPluginControlCommand({
        pluginName,
        action: "start",
        options: opts,
      });
    });

  plugin
    .command("stop <pluginName>")
    .description("按 agent 目标停止托管 plugin")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <id>", "agent id（从 managed agent registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePort)
    .option("--token <token>", "覆盖 Bearer Token（按 HTTP daemon 调用时可选）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean, true)
    .action(async (pluginName: string, opts: PluginCliBaseOptions) => {
      await runManagedPluginControlCommand({
        pluginName,
        action: "stop",
        options: opts,
      });
    });

  plugin
    .command("restart <pluginName>")
    .description("按 agent 目标重启托管 plugin")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <id>", "agent id（从 managed agent registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePort)
    .option("--token <token>", "覆盖 Bearer Token（按 HTTP daemon 调用时可选）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean, true)
    .action(async (pluginName: string, opts: PluginCliBaseOptions) => {
      await runManagedPluginControlCommand({
        pluginName,
        action: "restart",
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
    .option("--token <token>", "覆盖 Bearer Token（按 HTTP daemon 调用时可选）")
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
