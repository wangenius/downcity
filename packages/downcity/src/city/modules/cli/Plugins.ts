/**
 * `city plugin` 命令组。
 *
 * 关键点（中文）
 * - 为新的插件体系提供通用管理入口。
 * - 当前阶段支持 list / status / action 三类本地命令。
 */

import path from "node:path";
import fs from "node:fs";
import type { Command } from "commander";
import {
  findStaticPluginView,
} from "@/city/plugin/Catalog.js";
import {
  getLocalPluginAvailability,
  listLocalPlugins,
  runLocalPluginAction,
} from "@/city/plugin/LocalExecution.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import type { JsonValue } from "@/shared/types/Json.js";
import { getDowncityJsonPath } from "@/city/runtime/env/Paths.js";
import { listConsoleAgents } from "@/city/runtime/console/ConsoleRegistry.js";
import type { PluginCliBaseOptions } from "@/shared/types/PluginApi.js";

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
      error: `Agent not found in console registry: ${agentName}. Run "city console agents" to inspect names.`,
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

function printStaticPluginListFallback(params: {
  projectRoot?: string;
  asJson?: boolean;
  title: string;
  reason: string;
}): void {
  printResult({
    asJson: params.asJson,
    success: true,
    title: params.title,
    payload: {
      plugins: [],
      message: params.reason,
    },
  });
}

function printStaticPluginStatusFallback(params: {
  pluginName: string;
  projectRoot?: string;
  asJson?: boolean;
  title: string;
  reason: string;
}): void {
  const plugin = findStaticPluginView(params.pluginName);
  if (!plugin) {
    printResult({
      asJson: params.asJson,
      success: false,
      title: params.title,
      payload: {
        error: `Unknown plugin: ${params.pluginName}`,
      },
    });
    return;
  }

  printResult({
    asJson: params.asJson,
    success: true,
    title: params.title,
      payload: {
        plugin,
        availability: {
          enabled: false,
          available: false,
          reasons: [params.reason],
        },
        message: params.reason,
      },
    });
}

async function runPluginListCommand(options: PluginCliBaseOptions): Promise<void> {
  const resolved = await resolvePluginProjectRoot(options);
  if (!resolved.projectRoot) {
    printStaticPluginListFallback({
      projectRoot: undefined,
      asJson: options.json,
      title: "plugins listed (static catalog)",
      reason:
        resolved.error ||
        "Agent project path is not resolved. Showing console-side plugin catalog only.",
    });
    return;
  }

  const pathError = validatePluginProjectRoot(resolved.projectRoot);
  if (pathError) {
    printStaticPluginListFallback({
      projectRoot: resolved.projectRoot,
      asJson: options.json,
      title: "plugins listed (static catalog)",
      reason: `${pathError} Showing console-side plugin catalog only.`,
    });
    return;
  }

  const plugins = await Promise.all(
    listLocalPlugins().map(async (plugin) => ({
      ...plugin,
      availability: await getLocalPluginAvailability(
        resolved.projectRoot as string,
        plugin.name,
      ),
    })),
  );
  printResult({
    asJson: options.json,
    success: true,
    title: "plugins listed",
    payload: {
      plugins,
    },
  });
}

async function runPluginAvailabilityCommand(params: {
  pluginName: string;
  options: PluginCliBaseOptions;
}): Promise<void> {
  const resolved = await resolvePluginProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printStaticPluginStatusFallback({
      pluginName: params.pluginName,
      projectRoot: undefined,
      asJson: params.options.json,
      title: "plugin status (static catalog)",
      reason:
        resolved.error ||
        "Agent project path is not resolved. Showing console-side plugin metadata only.",
    });
    return;
  }

  const pathError = validatePluginProjectRoot(resolved.projectRoot);
  if (pathError) {
    printStaticPluginStatusFallback({
      pluginName: params.pluginName,
      projectRoot: resolved.projectRoot,
      asJson: params.options.json,
      title: "plugin status (static catalog)",
      reason: `${pathError} Showing console-side plugin metadata only.`,
    });
    return;
  }

  const plugin = findStaticPluginView(params.pluginName);
  if (!plugin) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "plugin status failed",
      payload: {
        error: `Unknown plugin: ${params.pluginName}`,
      },
    });
    return;
  }

  const availability = await getLocalPluginAvailability(
    resolved.projectRoot,
    params.pluginName,
  );
  printResult({
    asJson: params.options.json,
    success: true,
    title: "plugin status ok",
    payload: {
      pluginName: params.pluginName,
      plugin,
      availability,
    },
  });
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
    .description("Plugin 管理命令")
    .helpOption("--help", "display help for command");

  plugin
    .command("list")
    .description("列出全部已注册 plugin")
    .option("--path <path>", "agent 项目路径（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (opts: PluginCliBaseOptions) => {
      await runPluginListCommand(opts);
    });

  plugin
    .command("status <pluginName>")
    .description("查看单个 plugin 可用性")
    .option("--path <path>", "agent 项目路径（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (pluginName: string, opts: PluginCliBaseOptions) => {
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
