/**
 * `city service` 命令组。
 *
 * 关键点（中文）
 * - 统一管理 service runtime：list/status/start/stop/restart
 * - 所有 service 默认支持 command 桥接（含内建 lifecycle 命令）
 */

import path from "node:path";
import fs from "node:fs";
import type { Command } from "commander";
import { callServer } from "@/console/daemon/Client.js";
import { printResult } from "@agent/utils/CliOutput.js";
import type { JsonValue } from "@/types/Json.js";
import { getProfileMdPath, getShipJsonPath } from "@/console/env/Paths.js";
import { listConsoleAgents } from "@/console/runtime/ConsoleRegistry.js";
import type {
  ServiceCliBaseOptions,
  ServiceCommandResponse,
  ServiceControlAction,
  ServiceControlResponse,
  ServiceListResponse,
} from "@agent/types/Services.js";

function isRegistryEntryRunning(
  entry: { status?: "running" | "stopped" },
): boolean {
  return entry.status !== "stopped";
}

function parsePortOption(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || Number.isNaN(port) || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function resolveProjectRoot(pathInput?: string): string {
  const raw = String(pathInput || ".").trim() || ".";
  // 关键点（中文）：在 agent shell 中，默认 path="." 时优先使用注入的 DC_AGENT_PATH。
  if (raw === ".") {
    const envAgentPath = String(process.env.DC_AGENT_PATH || "").trim();
    if (envAgentPath) return path.resolve(envAgentPath);
  }
  return path.resolve(raw);
}

/**
 * 读取 agent 显示名（优先 ship.json.name，其次目录名）。
 */
function readAgentName(projectRoot: string): string {
  const shipJsonPath = getShipJsonPath(projectRoot);
  const fallback = path.basename(projectRoot);
  if (!fs.existsSync(shipJsonPath)) return fallback;
  try {
    const raw = fs.readFileSync(shipJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      return parsed.name.trim();
    }
  } catch {
    // ignore and fallback
  }
  return fallback;
}

/**
 * 通过 agent 名称解析 projectRoot。
 */
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

/**
 * 统一解析 service 命令目标路径（agent 优先于 path）。
 */
async function resolveServiceProjectRoot(options: ServiceCliBaseOptions): Promise<{
  projectRoot?: string;
  error?: string;
}> {
  const explicitAgent = String(options.agent || "").trim();
  if (explicitAgent) {
    return resolveProjectRootByAgentName(explicitAgent);
  }

  const rawPath = String(options.path || ".").trim() || ".";
  // 关键点（中文）：在 agent shell 中，未显式传 --agent 且 path 走默认值时，
  // 优先使用注入的 DC_AGENT_NAME 走 registry 解析，确保多 agent 下目标稳定。
  if (rawPath === ".") {
    const envAgentName = String(process.env.DC_AGENT_NAME || "").trim();
    if (envAgentName) {
      const byName = await resolveProjectRootByAgentName(envAgentName);
      if (byName.projectRoot) {
        return byName;
      }
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

/**
 * 校验路径是否为有效 agent 项目目录。
 *
 * 关键点（中文）
 * - service 命令必须绑定 agent 项目路径，避免在多 agent 场景误连默认端口。
 */
function validateAgentProjectRoot(projectRoot: string): string | null {
  const missing: string[] = [];
  if (!fs.existsSync(getShipJsonPath(projectRoot))) {
    missing.push("ship.json");
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
    // 关键点（中文）：payload 不是 JSON 时按字符串透传，避免强制格式。
    return text;
  }
}

async function runServiceListCommand(options: ServiceCliBaseOptions): Promise<void> {
  const resolved = await resolveServiceProjectRoot(options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: options.json,
      success: false,
      title: "service list failed",
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }
  const projectRoot = resolved.projectRoot;
  const pathError = validateAgentProjectRoot(projectRoot);
  if (pathError) {
    printResult({
      asJson: options.json,
      success: false,
      title: "service list failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }
  const remote = await callServer<ServiceListResponse>({
    projectRoot,
    path: "/api/services/list",
    method: "GET",
    host: options.host,
    port: options.port,
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? "services listed" : "service list failed",
      payload: {
        ...(Array.isArray(remote.data.services) ? { services: remote.data.services } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: options.json,
    success: false,
    title: "service list failed",
    payload: {
      error:
        remote.error ||
        "Service list requires an active Agent server runtime. Start via `city agent start` first.",
    },
  });
}

async function runServiceControlCommand(params: {
  serviceName: string;
  action: ServiceControlAction;
  options: ServiceCliBaseOptions;
}): Promise<void> {
  const resolved = await resolveServiceProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: `service ${params.action} failed`,
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }
  const projectRoot = resolved.projectRoot;
  const pathError = validateAgentProjectRoot(projectRoot);
  if (pathError) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: `service ${params.action} failed`,
      payload: {
        error: pathError,
      },
    });
    return;
  }
  const remote = await callServer<ServiceControlResponse>({
    projectRoot,
    path: "/api/services/control",
    method: "POST",
    host: params.options.host,
    port: params.options.port,
    body: {
      serviceName: params.serviceName,
      action: params.action,
    },
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: params.options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? `service ${params.action} ok` : `service ${params.action} failed`,
      payload: {
        ...(remote.data.service ? { service: remote.data.service } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: params.options.json,
    success: false,
    title: `service ${params.action} failed`,
    payload: {
      error:
        remote.error ||
        `Service ${params.action} requires an active Agent server runtime. Start via \`city agent start\` first.`,
    },
  });
}

async function runServiceCommandBridge(params: {
  serviceName: string;
  command: string;
  payloadRaw?: string;
  options: ServiceCliBaseOptions;
}): Promise<void> {
  const resolved = await resolveServiceProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service command failed",
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }
  const projectRoot = resolved.projectRoot;
  const pathError = validateAgentProjectRoot(projectRoot);
  if (pathError) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service command failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }
  const remote = await callServer<ServiceCommandResponse>({
    projectRoot,
    path: "/api/services/command",
    method: "POST",
    host: params.options.host,
    port: params.options.port,
    body: {
      serviceName: params.serviceName,
      command: params.command,
      ...(params.payloadRaw !== undefined
        ? { payload: parseCommandPayload(params.payloadRaw) }
        : {}),
    },
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: params.options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? "service command ok" : "service command failed",
      payload: {
        ...(remote.data.service ? { service: remote.data.service } : {}),
        ...(remote.data.message ? { message: remote.data.message } : {}),
        ...(remote.data.data !== undefined ? { data: remote.data.data } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: params.options.json,
    success: false,
    title: "service command failed",
    payload: {
      error:
        remote.error ||
        "Service command requires an active Agent server runtime. Start via `city agent start` first.",
    },
  });
}

/**
 * 注册 `service` 命令组。
 */
export function registerServicesCommand(program: Command): void {
  const service = program
    .command("service")
    .description("Service runtime 管理命令")
    .helpOption("--help", "display help for command");

  service
    .command("list")
    .description("列出全部 service 运行状态")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (opts: ServiceCliBaseOptions) => {
      await runServiceListCommand(opts);
    });

  service
    .command("status <serviceName>")
    .description("查看单个 service 状态")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (serviceName: string, opts: ServiceCliBaseOptions) => {
      await runServiceControlCommand({
        serviceName,
        action: "status",
        options: opts,
      });
    });

  service
    .command("start <serviceName>")
    .description("启动 service")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (serviceName: string, opts: ServiceCliBaseOptions) => {
      await runServiceControlCommand({
        serviceName,
        action: "start",
        options: opts,
      });
    });

  service
    .command("stop <serviceName>")
    .description("停止 service")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (serviceName: string, opts: ServiceCliBaseOptions) => {
      await runServiceControlCommand({
        serviceName,
        action: "stop",
        options: opts,
      });
    });

  service
    .command("restart <serviceName>")
    .description("重启 service")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (serviceName: string, opts: ServiceCliBaseOptions) => {
      await runServiceControlCommand({
        serviceName,
        action: "restart",
        options: opts,
      });
    });

  service
    .command("command <serviceName> <command>")
    .description("转发 service command")
    .option("--payload <json>", "可选 payload（JSON 字符串或普通字符串）")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(
      async (
        serviceName: string,
        command: string,
        opts: ServiceCliBaseOptions & { payload?: string },
      ) => {
        await runServiceCommandBridge({
          serviceName,
          command,
          payloadRaw: opts.payload,
          options: opts,
        });
      },
    );
}
