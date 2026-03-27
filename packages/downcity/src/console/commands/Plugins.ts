/**
 * `city plugin` 命令组。
 *
 * 关键点（中文）
 * - 为新的插件体系提供通用管理入口。
 * - 当前阶段支持 list / status / action 三类桥接。
 */

import path from "node:path";
import fs from "node:fs";
import type { Command } from "commander";
import { callServer } from "@/console/daemon/Client.js";
import {
  buildStaticPluginAvailability,
  findStaticPluginRuntimeView,
  listStaticPluginRuntimeViews,
} from "@/console/plugin/Catalog.js";
import { printResult } from "@agent/utils/CliOutput.js";
import type { JsonValue } from "@/types/Json.js";
import { getProfileMdPath, getDowncityJsonPath } from "@/console/env/Paths.js";
import { listConsoleAgents } from "@/console/runtime/ConsoleRegistry.js";
import type {
  PluginActionResponse,
  PluginAvailabilityResponse,
  PluginCliBaseOptions,
  PluginListResponse,
} from "@/types/PluginApi.js";

function isRegistryEntryRunning(
  entry: { status?: "running" | "stopped" },
): boolean {
  return entry.status !== "stopped";
}

function parsePortOption(value: string): number {
  const port = Number.parseInt(value, 10);
  if (
    !Number.isFinite(port) ||
    Number.isNaN(port) ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535
  ) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
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

  const rawPath = String(options.path || ".").trim() || ".";
  if (rawPath === ".") {
    const envAgentName = String(process.env.DC_AGENT_NAME || "").trim();
    if (envAgentName) {
      const byName = await resolveProjectRootByAgentName(envAgentName);
      if (byName.projectRoot) return byName;
    }
  }

  const projectRoot = resolveProjectRoot(options.path);
  const entries = await listConsoleAgents();
  const registered = entries.some(
    (entry) =>
      isRegistryEntryRunning(entry) &&
      path.resolve(String(entry.projectRoot || "").trim() || ".") === projectRoot,
  );
  if (!registered) {
    return {
      error:
        `Agent is not registered in console registry: ${projectRoot}. ` +
        `Run "city console agents" to inspect registered agents.`,
    };
  }
  return { projectRoot };
}

function validateAgentProjectRoot(projectRoot: string): string | null {
  const missing: string[] = [];
  if (!fs.existsSync(getDowncityJsonPath(projectRoot))) {
    missing.push("downcity.json");
  }
  if (!fs.existsSync(getProfileMdPath(projectRoot))) {
    missing.push("PROFILE.md");
  }
  if (missing.length === 0) return null;
  return `Invalid agent path: ${projectRoot}. Missing: ${missing.join(", ")}`;
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
      plugins: listStaticPluginRuntimeViews().map((plugin) => ({
        ...plugin,
        availability: buildStaticPluginAvailability({
          pluginName: plugin.name,
          projectRoot: params.projectRoot,
          runtimeError: params.reason,
        }),
      })),
      runtimeConnected: false,
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
  const plugin = findStaticPluginRuntimeView(params.pluginName);
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
      availability: buildStaticPluginAvailability({
        pluginName: plugin.name,
        projectRoot: params.projectRoot,
        runtimeError: params.reason,
      }),
      runtimeConnected: false,
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

  const pathError = validateAgentProjectRoot(resolved.projectRoot);
  if (pathError) {
    printStaticPluginListFallback({
      projectRoot: resolved.projectRoot,
      asJson: options.json,
      title: "plugins listed (static catalog)",
      reason: `${pathError} Showing console-side plugin catalog only.`,
    });
    return;
  }

  const remote = await callServer<PluginListResponse>({
    projectRoot: resolved.projectRoot,
    path: "/api/plugins/list",
    method: "GET",
    host: options.host,
    port: options.port,
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? "plugins listed" : "plugin list failed",
      payload: {
        ...(Array.isArray(remote.data.plugins)
          ? { plugins: remote.data.plugins }
          : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printStaticPluginListFallback({
    projectRoot: resolved.projectRoot,
    asJson: options.json,
    title: "plugins listed (static catalog)",
    reason:
      remote.error ||
      "Agent runtime is unavailable. Showing console-side plugin catalog only.",
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

  const pathError = validateAgentProjectRoot(resolved.projectRoot);
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

  const remote = await callServer<PluginAvailabilityResponse>({
    projectRoot: resolved.projectRoot,
    path: "/api/plugins/availability",
    method: "POST",
    host: params.options.host,
    port: params.options.port,
    body: {
      pluginName: params.pluginName,
    },
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: params.options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? "plugin status ok" : "plugin status failed",
      payload: {
        ...(remote.data.pluginName ? { pluginName: remote.data.pluginName } : {}),
        ...(remote.data.availability
          ? { availability: remote.data.availability }
          : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printStaticPluginStatusFallback({
    pluginName: params.pluginName,
    projectRoot: resolved.projectRoot,
    asJson: params.options.json,
    title: "plugin status (static catalog)",
    reason:
      remote.error ||
      "Agent runtime is unavailable. Showing console-side plugin metadata only.",
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

  const pathError = validateAgentProjectRoot(resolved.projectRoot);
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

  const remote = await callServer<PluginActionResponse>({
    projectRoot: resolved.projectRoot,
    path: "/api/plugins/action",
    method: "POST",
    host: params.options.host,
    port: params.options.port,
    body: {
      pluginName: params.pluginName,
      actionName: params.actionName,
      ...(parseCommandPayload(params.payload) !== undefined
        ? { payload: parseCommandPayload(params.payload) }
        : {}),
    },
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: params.options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? "plugin action ok" : "plugin action failed",
      payload: {
        ...(remote.data.pluginName ? { pluginName: remote.data.pluginName } : {}),
        ...(remote.data.actionName ? { actionName: remote.data.actionName } : {}),
        ...(remote.data.data !== undefined ? { data: remote.data.data } : {}),
        ...(remote.data.message ? { message: remote.data.message } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: params.options.json,
    success: false,
    title: "plugin action failed",
    payload: {
      error:
        remote.error ||
        "Plugin action requires an active Agent server runtime. Start via `city agent start` first.",
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
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (opts: PluginCliBaseOptions) => {
      await runPluginListCommand(opts);
    });

  plugin
    .command("status <pluginName>")
    .description("查看单个 plugin 可用性")
    .option("--path <path>", "agent 项目路径（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
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
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
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
