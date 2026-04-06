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
import {
  buildStaticPluginAvailability,
  findStaticPluginView,
  listStaticPluginViews,
} from "@/main/plugin/Catalog.js";
import { runLocalPluginAction } from "@/main/plugin/LocalExecution.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import type { JsonValue } from "@/shared/types/Json.js";
import { getDowncityJsonPath } from "@/main/city/env/Paths.js";
import { listConsoleAgents } from "@/main/city/runtime/CityRegistry.js";
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

async function runPluginListCommand(options: { json?: boolean }): Promise<void> {
  const plugins = listStaticPluginViews().map((plugin) => ({
    ...plugin,
    availability: buildSafeStaticPluginAvailability(plugin.name),
  }));
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
  options: { json?: boolean };
}): Promise<void> {
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

  printResult({
    asJson: params.options.json,
    success: true,
    title: "plugin status ok",
    payload: {
      pluginName: params.pluginName,
      plugin,
      availability: buildSafeStaticPluginAvailability(params.pluginName),
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
    .description("查看 plugin catalog，并提供高级 action 入口")
    .helpOption("--help", "display help for command");

  plugin
    .command("list")
    .description("列出全部已注册 plugin 的静态信息")
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (opts: { json?: boolean }) => {
      await runPluginListCommand(opts);
    });

  plugin
    .command("status <pluginName>")
    .description("查看单个 plugin 的静态信息")
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (pluginName: string, opts: { json?: boolean }) => {
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
