/**
 * `city service` 命令共享辅助。
 *
 * 关键点（中文）
 * - 统一承载 service 命令的参数解析、目标 agent 路径解析与项目目录校验。
 * - 保持 command 注册层只关注命令树，不再直接承载路径解析细节。
 */

import path from "node:path";
import fs from "node:fs";
import type { Command } from "commander";
import { getProfileMdPath, getDowncityJsonPath } from "@/main/env/Paths.js";
import { listConsoleAgents } from "@/main/runtime/ConsoleRegistry.js";
import type { JsonValue } from "@/types/Json.js";
import type { ScheduledJobStatus } from "@/types/ServiceSchedule.js";
import type { ServiceCliBaseOptions } from "@/types/Services.js";

function isRegistryEntryRunning(
  entry: { status?: "running" | "stopped" },
): boolean {
  return entry.status !== "stopped";
}

/**
 * 解析端口参数。
 */
export function parsePortOption(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || Number.isNaN(port) || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

/**
 * 解析正整数参数。
 */
export function parsePositiveIntOption(value: string, fieldName: string): number {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

/**
 * 归一化 schedule 状态过滤参数。
 */
export function normalizeScheduledJobStatus(
  value: string | undefined,
): ScheduledJobStatus | undefined {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return undefined;
  if (
    text === "pending" ||
    text === "running" ||
    text === "succeeded" ||
    text === "failed" ||
    text === "cancelled"
  ) {
    return text;
  }
  throw new Error(
    `Invalid schedule status: ${value}. Use pending|running|succeeded|failed|cancelled.`,
  );
}

/**
 * 解析项目根目录。
 */
export function resolveProjectRoot(pathInput?: string): string {
  const raw = String(pathInput || ".").trim() || ".";
  // 关键点（中文）：在 agent shell 中，默认 path="." 时优先使用注入的 DC_AGENT_PATH。
  if (raw === ".") {
    const envAgentPath = String(process.env.DC_AGENT_PATH || "").trim();
    if (envAgentPath) return path.resolve(envAgentPath);
  }
  return path.resolve(raw);
}

/**
 * 读取 agent 显示名（优先 downcity.json.name，其次目录名）。
 */
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
    // ignore and fallback
  }
  return fallback;
}

/**
 * 通过 agent 名称解析 projectRoot。
 */
export async function resolveProjectRootByAgentName(agentName: string): Promise<{
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
export async function resolveServiceProjectRoot(options: ServiceCliBaseOptions): Promise<{
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
 * 解析 schedule 管理命令目标路径。
 */
export async function resolveScheduleProjectRoot(options: ServiceCliBaseOptions): Promise<{
  projectRoot?: string;
  error?: string;
}> {
  const explicitAgent = String(options.agent || "").trim();
  if (explicitAgent) {
    return resolveProjectRootByAgentName(explicitAgent);
  }
  return {
    projectRoot: resolveProjectRoot(options.path),
  };
}

/**
 * 校验路径是否为有效 agent 项目目录。
 */
export function validateAgentProjectRoot(projectRoot: string): string | null {
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

/**
 * 解析 service command payload。
 */
export function parseCommandPayload(raw?: string): JsonValue | undefined {
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

/**
 * 注入 service 目标解析通用选项。
 */
export function addServiceTargetOptions(command: Command): Command {
  return command
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--token <token>", "覆盖 Bearer Token（默认自动读取 DC_AUTH_TOKEN 或本地登录态）")
    .option("--json [enabled]", "以 JSON 输出", true);
}

/**
 * 注入 schedule 管理命令通用选项。
 */
export function addServiceScheduleOptions(command: Command): Command {
  return command
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--json [enabled]", "以 JSON 输出", true);
}
