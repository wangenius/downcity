/**
 * `city plugin` 命令组。
 *
 * 关键点（中文）
 * - `city plugin` 提供 console 侧静态 plugin catalog 入口。
 * - `list/status` 不依赖 agent，只展示内建 plugin 定义与 city 配置事实。
 * - `action` 仍保留为高级入口，真正执行时依赖具体 agent 项目。
 */

import path from "node:path";
import fs from "node:fs";
import type { Command } from "commander";
import prompts from "prompts";
import {
  buildStaticPluginAvailability,
  findBuiltinPlugin,
  findStaticPluginView,
  listStaticPluginViews,
} from "@/main/plugin/Catalog.js";
import { setCityPluginEnabled } from "@/main/plugin/Lifecycle.js";
import { runLocalPluginAction } from "@/main/plugin/LocalExecution.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import type { JsonValue } from "@/shared/types/Json.js";
import { getDowncityJsonPath } from "@/main/city/env/Paths.js";
import { listConsoleAgents } from "@/main/city/runtime/CityRegistry.js";
import type { PluginCliBaseOptions } from "@/shared/types/PluginApi.js";
import { emitCliBlock } from "./CliReporter.js";
import { parseBoolean } from "./IndexSupport.js";

function isRegistryEntryRunning(
  entry: { status?: "running" | "stopped" },
): boolean {
  return entry.status !== "stopped";
}

function resolveProjectRoot(pathInput?: string): string {
  const raw = String(pathInput || ".").trim() || ".";
  if (raw === ".") {
    const envAgentPath = String(process.env.DC_AGENT_PATH || "").trim();
    if (envAgentPath) return path.resolve(envAgentPath);
  }
  return path.resolve(raw);
}

function readAgentName(projectRoot: string): string {
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  const fallback = path.basename(projectRoot);
  if (!fs.existsSync(shipJsonPath)) return fallback;
  try {
    const raw = fs.readFileSync(shipJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      return parsed.name.trim();
    }
  } catch {
    // ignore
  }
  return fallback;
}

async function resolveProjectRootByAgentName(agentName: string): Promise<{
  projectRoot?: string;
  error?: string;
}> {
  const target = String(agentName || "").trim().toLowerCase();
  if (!target) {
    return { error: "--agent requires a non-empty value" };
  }

  const entries = await listConsoleAgents();
  const matchedRoots = entries
    .filter((entry) => isRegistryEntryRunning(entry))
    .map((entry) => path.resolve(String(entry.projectRoot || "").trim() || "."))
    .filter((root, index, all) => all.indexOf(root) === index)
    .filter((root) => {
      const byDirName = path.basename(root).toLowerCase() === target;
      const byShipName = readAgentName(root).toLowerCase() === target;
      return byDirName || byShipName;
    });

  if (matchedRoots.length === 0) {
    return {
      error: `Agent not found in console registry: ${agentName}. Run "city agent list" to inspect names.`,
    };
  }
  if (matchedRoots.length > 1) {
    return {
      error: `Agent name is ambiguous: ${agentName}. Matched paths: ${matchedRoots.join(", ")}`,
    };
  }

  return { projectRoot: matchedRoots[0] };
}

async function resolvePluginProjectRoot(options: PluginCliBaseOptions): Promise<{
  projectRoot?: string;
  error?: string;
}> {
  const explicitAgent = String(options.agent || "").trim();
  if (explicitAgent) {
    return resolveProjectRootByAgentName(explicitAgent);
  }

  return { projectRoot: resolveProjectRoot(options.path) };
}

function validatePluginProjectRoot(projectRoot: string): string | null {
  if (!fs.existsSync(getDowncityJsonPath(projectRoot))) {
    return `Invalid project path: ${projectRoot}. Missing: downcity.json`;
  }
  return null;
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

  const headers = ["plugin", "enabled", "available", "actions", "title"] as const;
  const dataRows = rows.map((row) => [
    row.name,
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
  widths[4] = Math.min(Math.max(widths[4], 16), 40);

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

async function promptPluginName(message: string): Promise<string | null> {
  const plugins = listStaticPluginViews();
  const response = (await prompts({
    type: "select",
    name: "pluginName",
    message,
    choices: plugins.map((plugin) => ({
      title: plugin.name,
      description: plugin.title || plugin.description || "",
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
  const plugin = findStaticPluginView(params.pluginName);
  const availability = buildSafeStaticPluginAvailability(params.pluginName);
  const response = (await prompts({
    type: "select",
    name: "action",
    message: `管理 plugin · ${params.pluginName}`,
    choices: [
      {
        title: "查看状态",
        description: plugin?.title || params.pluginName,
        value: "status",
      },
      {
        title: "全局启用",
        description: availability.enabled ? "当前已启用" : "写入 city 级 lifecycle 配置",
        value: "enable",
      },
      {
        title: "全局关闭",
        description:
          params.pluginName === "auth"
            ? "auth plugin 不允许全局关闭"
            : "写入 city 级 lifecycle 配置",
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
      note: "Use `city plugin status <pluginName>` or run this command in an interactive terminal.",
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
  const plugins = listStaticPluginViews().map((plugin) => ({
    ...plugin,
    availability: buildSafeStaticPluginAvailability(plugin.name),
  }));
  if (options.json !== true) {
    renderPluginCatalogTable(
      plugins.map((plugin) => ({
        name: plugin.name,
        title: plugin.title,
        enabled: plugin.availability.enabled,
        available: plugin.availability.available,
        actionCount: plugin.actions.length,
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

async function runPluginAvailabilityCommand(params: {
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

  const plugin = findStaticPluginView(pluginName);
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

  const availability = buildSafeStaticPluginAvailability(pluginName);
  if (params.options.json !== true) {
    emitCliBlock({
      tone: availability.available ? "success" : availability.enabled ? "warning" : "info",
      title: `Plugin ${pluginName}`,
      summary: availability.available ? "available" : availability.enabled ? "static only" : "disabled",
      facts: [
        {
          label: "title",
          value: plugin.title || pluginName,
        },
        {
          label: "actions",
          value: plugin.actions.join(", ") || "none",
        },
        {
          label: "system",
          value: plugin.hasSystem ? "yes" : "no",
        },
        ...(availability.reasons.length > 0
          ? [
              {
                label: "note",
                value: availability.reasons.join("; "),
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
    title: "plugin status ok",
    payload: {
      pluginName,
      plugin,
      availability,
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
        value: "city",
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
  const plugin = findBuiltinPlugin(params.pluginName);
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

  setCityPluginEnabled(plugin.name, params.enabled);
  if (params.asJson === true) {
    printResult({
      asJson: true,
      success: true,
      title: "plugin lifecycle updated",
      payload: {
        pluginName: plugin.name,
        enabled: params.enabled,
        scope: "city",
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
        await runPluginAvailabilityCommand({
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

  const pathError = validatePluginProjectRoot(resolved.projectRoot);
  if (pathError) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "plugin action failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }

  const payload = parseCommandPayload(params.payload);
  const local = await runLocalPluginAction({
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
 * 注册 `city plugin` 命令组。
 */
export function registerPluginsCommand(program: Command): void {
  const plugin = program
    .command("plugin")
    .description("查看 plugin catalog，并提供高级 action 入口")
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
    .command("status [pluginName]")
    .description("查看单个 plugin 的静态信息")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .action(async (pluginName: string | undefined, opts: { json?: boolean }) => {
      await runPluginAvailabilityCommand({
        pluginName,
        options: opts,
      });
    });

  plugin
    .command("action <pluginName> <actionName>")
    .description("运行 plugin action")
    .option("--payload <json>", "Action payload（JSON 或普通字符串）")
    .option("--path <path>", "agent 项目路径（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--json [enabled]", "以 JSON 输出", true)
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
}
