/**
 * `city console config` 命令组。
 *
 * 目标（中文）
 * - 提供 downcity.json 的通用读写能力（get/set/unset）。
 * - 提供 alias 写入能力。
 * - 所有输出统一支持 JSON（默认）与可读文本两种模式。
 */

import path from "node:path";
import fs from "fs-extra";
import type { Command } from "commander";
import { getDowncityJsonPath } from "@/city/runtime/env/Paths.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import { aliasCommand } from "./Alias.js";
import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";

function parseBooleanOption(value: string | undefined): boolean {
  if (value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean: ${value}`);
}

function resolveProjectRoot(pathInput?: string): string {
  return path.resolve(String(pathInput || "."));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfigPath(pathInput: string): string[] {
  const trimmed = String(pathInput || "").trim();
  if (!trimmed) {
    throw new Error("Config path cannot be empty");
  }
  const parts = trimmed.split(".");
  if (parts.some((x) => x.trim().length === 0)) {
    throw new Error(`Invalid config path: ${pathInput}`);
  }
  return parts.map((x) => x.trim());
}

function parseConfigValue(rawValue: string): unknown {
  const trimmed = String(rawValue).trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return rawValue;
  }
}

function readDowncityConfigByPath(
  downcityJsonPath: string,
  scope: "project" | "console",
): { downcityJsonPath: string; config: DowncityConfig } {
  if (!fs.existsSync(downcityJsonPath)) {
    const hint =
      scope === "console"
        ? 'Run "city console init" first.'
        : 'Run "city agent create" first.';
    throw new Error(`downcity.json not found at ${downcityJsonPath}. ${hint}`);
  }
  const raw = fs.readJsonSync(downcityJsonPath) as unknown;
  if (!isPlainObject(raw)) {
    throw new Error("Invalid downcity.json: expected object");
  }
  const candidate = raw as Partial<DowncityConfig>;
  if (typeof candidate.name !== "string" || typeof candidate.version !== "string") {
    throw new Error("Invalid downcity.json: missing required fields name/version");
  }
  return { downcityJsonPath, config: candidate as DowncityConfig };
}

function readDowncityConfig(projectRoot: string): { downcityJsonPath: string; config: DowncityConfig } {
  return readDowncityConfigByPath(getDowncityJsonPath(projectRoot), "project");
}

function writeDowncityConfig(downcityJsonPath: string, config: DowncityConfig): void {
  fs.writeJsonSync(downcityJsonPath, config, { spaces: 2 });
}

function getByPath(
  root: Record<string, unknown>,
  pathTokens: string[],
): { found: boolean; value?: unknown } {
  let cursor: unknown = root;
  for (const token of pathTokens) {
    if (!isPlainObject(cursor) || !(token in cursor)) {
      return { found: false };
    }
    cursor = cursor[token];
  }
  return { found: true, value: cursor };
}

function setByPath(
  root: Record<string, unknown>,
  pathTokens: string[],
  nextValue: unknown,
): { existed: boolean; previous: unknown } {
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < pathTokens.length - 1; i += 1) {
    const key = pathTokens[i];
    const current = cursor[key];
    if (current === undefined) {
      cursor[key] = {};
      cursor = cursor[key] as Record<string, unknown>;
      continue;
    }
    if (!isPlainObject(current)) {
      throw new Error(
        `Cannot set path "${pathTokens.join(".")}": "${pathTokens
          .slice(0, i + 1)
          .join(".")}" is not an object`,
      );
    }
    cursor = current;
  }
  const leaf = pathTokens[pathTokens.length - 1];
  const existed = Object.prototype.hasOwnProperty.call(cursor, leaf);
  const previous = cursor[leaf];
  cursor[leaf] = nextValue;
  return { existed, previous };
}

function unsetByPath(
  root: Record<string, unknown>,
  pathTokens: string[],
): { removed: boolean; previous: unknown } {
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < pathTokens.length - 1; i += 1) {
    const key = pathTokens[i];
    const current = cursor[key];
    if (!isPlainObject(current)) {
      return { removed: false, previous: undefined };
    }
    cursor = current;
  }
  const leaf = pathTokens[pathTokens.length - 1];
  if (!Object.prototype.hasOwnProperty.call(cursor, leaf)) {
    return { removed: false, previous: undefined };
  }
  const previous = cursor[leaf];
  delete cursor[leaf];
  return { removed: true, previous };
}

function runConfigCommand(
  options: { path?: string; json?: boolean },
  handler: (input: {
    projectRoot: string;
    downcityJsonPath: string;
    config: DowncityConfig;
  }) => {
    title: string;
    payload: Record<string, unknown>;
    save?: boolean;
  },
): void {
  const asJson = options.json !== false;
  try {
    const projectRoot = resolveProjectRoot(options.path);
    const { downcityJsonPath, config } = readDowncityConfig(projectRoot);
    const result = handler({ projectRoot, downcityJsonPath, config });
    if (result.save) {
      writeDowncityConfig(downcityJsonPath, config);
    }
    printResult({
      asJson,
      success: true,
      title: result.title,
      payload: {
        projectRoot,
        downcityJsonPath,
        ...result.payload,
      },
    });
  } catch (error) {
    printResult({
      asJson,
      success: false,
      title: "config command failed",
      payload: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    process.exitCode = 1;
  }
}

function applyCommonOptions(command: Command): Command {
  return command
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true);
}

/**
 * 注册 `city console config` 命令组。
 */
export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("管理 downcity.json 配置与 alias")
    .helpOption("--help", "display help for command");

  applyCommonOptions(
    config
      .command("get [keyPath]")
      .description("读取 downcity.json（可选读取单个路径）")
      .helpOption("--help", "display help for command"),
  ).action((keyPath: string | undefined, options: { path?: string; json?: boolean }) => {
    runConfigCommand(options, ({ config: downcityConfig }) => {
      if (!keyPath) {
        return {
          title: "config loaded",
          payload: { config: downcityConfig },
        };
      }
      const pathTokens = parseConfigPath(keyPath);
      const got = getByPath(downcityConfig as unknown as Record<string, unknown>, pathTokens);
      if (!got.found) {
        throw new Error(`Config path not found: ${keyPath}`);
      }
      return {
        title: "config value loaded",
        payload: {
          keyPath,
          value: got.value,
        },
      };
    });
  });

  applyCommonOptions(
    config
      .command("set <keyPath> <value>")
      .description("设置 downcity.json 指定路径的值（value 支持 JSON 字面量）")
      .helpOption("--help", "display help for command"),
  ).action(
    (
      keyPath: string,
      value: string,
      options: { path?: string; json?: boolean },
    ) => {
      const pathTokens = parseConfigPath(keyPath);
      runConfigCommand(options, ({ config: downcityConfig }) => {
        const parsed = parseConfigValue(value);
        const changed = setByPath(
          downcityConfig as unknown as Record<string, unknown>,
          pathTokens,
          parsed,
        );
        return {
          title: "config value updated",
          save: true,
          payload: {
            keyPath,
            value: parsed,
            existed: changed.existed,
            previous: changed.previous,
          },
        };
      });
    },
  );

  applyCommonOptions(
    config
      .command("unset <keyPath>")
      .description("删除 downcity.json 指定路径")
      .helpOption("--help", "display help for command"),
  ).action((keyPath: string, options: { path?: string; json?: boolean }) => {
    const pathTokens = parseConfigPath(keyPath);
    runConfigCommand(options, ({ config: downcityConfig }) => {
      const removed = unsetByPath(
        downcityConfig as unknown as Record<string, unknown>,
        pathTokens,
      );
      if (!removed.removed) {
        throw new Error(`Config path not found: ${keyPath}`);
      }
      return {
        title: "config value removed",
        save: true,
        payload: {
          keyPath,
          previous: removed.previous,
        },
      };
    });
  });

  config
    .command("alias")
    .description("在 .zshrc / .bashrc 中写入 `alias city=\"downcity\"`")
    .option("--shell <shell>", "指定写入的 shell: zsh | bash | both", "both")
    .option("--dry-run", "只打印将要修改的文件，不实际写入", false)
    .option("--print", "仅打印 alias 内容（用于 eval）", false)
    .helpOption("--help", "display help for command")
    .action(async (options: { shell?: string; dryRun?: boolean; print?: boolean }) => {
      await aliasCommand({
        shell: options.shell,
        dryRun: Boolean(options.dryRun),
        print: Boolean(options.print),
      });
    });
}
