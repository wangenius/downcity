/**
 * CLI 入口共享工具。
 *
 * 关键点（中文）
 * - 统一承载 `Index.ts`、console 命令、agent 命令共用的参数解析与上下文注入逻辑。
 * - 保持共享工具纯函数化，避免命令装配文件继续膨胀。
 */

import { readFileSync, existsSync } from "fs";
import { basename, join, resolve } from "path";
import { emitCliHeader, resetCliSectionFlow } from "./CliReporter.js";

/**
 * 在关键运行命令执行前打印当前 city 版本。
 *
 * 说明（中文）
 * - 仅用于 runtime 相关命令，避免影响 `config --json` 等结构化输出。
 */
export function createVersionBanner<TArgs extends unknown[]>(
  version: string,
  action: (...args: TArgs) => Promise<void> | void,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs): Promise<void> => {
    // 关键点（中文）：`--json` 场景禁止在 stdout 混入 banner，避免破坏机器可解析输出。
    const hasJsonMode = args.some((arg) => {
      if (!arg || typeof arg !== "object") return false;
      if (!Object.prototype.hasOwnProperty.call(arg, "json")) return false;
      return (arg as { json?: unknown }).json === true;
    });
    if (!hasJsonMode) {
      resetCliSectionFlow();
      emitCliHeader(version);
    }
    await action(...args);
  };
}

/**
 * 解析端口参数。
 */
export function parsePort(value: string): number {
  const num = Number.parseInt(value, 10);
  if (
    !Number.isFinite(num) ||
    Number.isNaN(num) ||
    !Number.isInteger(num) ||
    num <= 0 ||
    num > 65535
  ) {
    throw new Error(`Invalid port: ${value}`);
  }
  return num;
}

/**
 * 解析布尔参数。
 */
export function parseBoolean(value: string | undefined): boolean {
  if (value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean: ${value}`);
}

/**
 * 异步睡眠工具。
 */
export const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 从项目根目录推断 agent 名称。
 */
export function resolveAgentName(projectRoot: string): string {
  const fallback = basename(projectRoot);
  const shipJsonPath = join(projectRoot, "downcity.json");
  if (!existsSync(shipJsonPath)) return fallback;

  try {
    const raw = readFileSync(shipJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      return parsed.name.trim();
    }
  } catch {
    // ignore parse errors and fallback to dirname
  }

  return fallback;
}

/**
 * 注入当前 agent 执行上下文。
 */
export function injectAgentContext(pathInput: string = "."): {
  projectRoot: string;
  agentName: string;
} {
  const projectRoot = resolve(String(pathInput || "."));
  const agentName = resolveAgentName(projectRoot);
  process.env.DC_AGENT_PATH = projectRoot;
  process.env.DC_AGENT_NAME = agentName;
  return { projectRoot, agentName };
}
