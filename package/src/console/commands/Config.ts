/**
 * `sma console config` 命令组。
 *
 * 目标（中文）
 * - 提供 ship.json 的通用读写能力（get/set/unset）。
 * - 提供 alias 写入能力。
 * - 所有输出统一支持 JSON（默认）与可读文本两种模式。
 */

import path from "node:path";
import fs from "fs-extra";
import type { Command } from "commander";
import { getShipJsonPath } from "@/console/env/Paths.js";
import { getConsoleShipDbPath } from "@/console/runtime/ConsolePaths.js";
import { printResult } from "@agent/utils/CliOutput.js";
import { aliasCommand } from "./Alias.js";
import type { ShipConfig } from "@agent/types/ShipConfig.js";
import { ConsoleStore } from "@/utils/store/index.js";

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

function isConsoleScopedConfigPath(pathTokens: string[]): boolean {
  return pathTokens.length > 0 && pathTokens[0] === "extensions";
}

function readShipConfigByPath(
  shipJsonPath: string,
  scope: "project" | "console",
): { shipJsonPath: string; config: ShipConfig } {
  if (!fs.existsSync(shipJsonPath)) {
    const hint =
      scope === "console"
        ? 'Run "sma console init" first.'
        : 'Run "sma agent create" first.';
    throw new Error(`ship.json not found at ${shipJsonPath}. ${hint}`);
  }
  const raw = fs.readJsonSync(shipJsonPath) as unknown;
  if (!isPlainObject(raw)) {
    throw new Error("Invalid ship.json: expected object");
  }
  const candidate = raw as Partial<ShipConfig>;
  if (typeof candidate.name !== "string" || typeof candidate.version !== "string") {
    throw new Error("Invalid ship.json: missing required fields name/version");
  }
  return { shipJsonPath, config: candidate as ShipConfig };
}

function readShipConfig(projectRoot: string): { shipJsonPath: string; config: ShipConfig } {
  return readShipConfigByPath(getShipJsonPath(projectRoot), "project");
}

function readConsoleStoreConfig(): { consoleStorePath: string; config: ShipConfig } {
  const store = new ConsoleStore();
  try {
    const raw = store.getExtensionsConfigSync<Record<string, unknown>>();
    const extensions =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw
        : {};
    return {
      consoleStorePath: getConsoleShipDbPath(),
      config: {
        name: "console",
        version: "1.0.0",
        extensions: extensions as ShipConfig["extensions"],
      },
    };
  } finally {
    store.close();
  }
}

function writeConsoleStoreConfig(config: ShipConfig): void {
  const store = new ConsoleStore();
  try {
    const extensions =
      config.extensions && typeof config.extensions === "object"
        ? config.extensions
        : {};
    store.setExtensionsConfigSync(extensions);
  } finally {
    store.close();
  }
}

function writeShipConfig(shipJsonPath: string, config: ShipConfig): void {
  fs.writeJsonSync(shipJsonPath, config, { spaces: 2 });
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
    shipJsonPath: string;
    config: ShipConfig;
  }) => {
    title: string;
    payload: Record<string, unknown>;
    save?: boolean;
  },
): void {
  const asJson = options.json !== false;
  try {
    const projectRoot = resolveProjectRoot(options.path);
    const { shipJsonPath, config } = readShipConfig(projectRoot);
    const result = handler({ projectRoot, shipJsonPath, config });
    if (result.save) {
      writeShipConfig(shipJsonPath, config);
    }
    printResult({
      asJson,
      success: true,
      title: result.title,
      payload: {
        projectRoot,
        shipJsonPath,
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
 * 注册 `sma console config` 命令组。
 */
export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("管理 ship.json 配置与 alias")
    .helpOption("--help", "display help for command");

  applyCommonOptions(
    config
      .command("get [keyPath]")
      .description("读取 ship.json（可选读取单个路径）")
      .helpOption("--help", "display help for command"),
  ).action((keyPath: string | undefined, options: { path?: string; json?: boolean }) => {
    if (keyPath) {
      const pathTokens = parseConfigPath(keyPath);
      if (isConsoleScopedConfigPath(pathTokens)) {
        const asJson = options.json !== false;
        try {
          const { consoleStorePath, config: shipConfig } = readConsoleStoreConfig();
          const got = getByPath(
            shipConfig as unknown as Record<string, unknown>,
            pathTokens,
          );
          if (!got.found) {
            throw new Error(`Config path not found: ${keyPath}`);
          }
          printResult({
            asJson,
            success: true,
            title: "config value loaded",
            payload: {
              scope: "console",
              consoleStorePath,
              keyPath,
              value: got.value,
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
        return;
      }
    }
    runConfigCommand(options, ({ config: shipConfig }) => {
      if (!keyPath) {
        return {
          title: "config loaded",
          payload: { config: shipConfig },
        };
      }
      const pathTokens = parseConfigPath(keyPath);
      const got = getByPath(shipConfig as unknown as Record<string, unknown>, pathTokens);
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
      .description("设置 ship.json 指定路径的值（value 支持 JSON 字面量）")
      .helpOption("--help", "display help for command"),
  ).action(
    (
      keyPath: string,
      value: string,
      options: { path?: string; json?: boolean },
    ) => {
      const pathTokens = parseConfigPath(keyPath);
      if (isConsoleScopedConfigPath(pathTokens)) {
        const asJson = options.json !== false;
        try {
          const { consoleStorePath, config: shipConfig } = readConsoleStoreConfig();
          const parsed = parseConfigValue(value);
          const changed = setByPath(
            shipConfig as unknown as Record<string, unknown>,
            pathTokens,
            parsed,
          );
          writeConsoleStoreConfig(shipConfig);
          printResult({
            asJson,
            success: true,
            title: "config value updated",
            payload: {
              scope: "console",
              consoleStorePath,
              keyPath,
              value: parsed,
              existed: changed.existed,
              previous: changed.previous,
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
        return;
      }
      runConfigCommand(options, ({ config: shipConfig }) => {
        const parsed = parseConfigValue(value);
        const changed = setByPath(
          shipConfig as unknown as Record<string, unknown>,
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
      .description("删除 ship.json 指定路径")
      .helpOption("--help", "display help for command"),
  ).action((keyPath: string, options: { path?: string; json?: boolean }) => {
    const pathTokens = parseConfigPath(keyPath);
    if (isConsoleScopedConfigPath(pathTokens)) {
      const asJson = options.json !== false;
      try {
        const { consoleStorePath, config: shipConfig } = readConsoleStoreConfig();
        const removed = unsetByPath(
          shipConfig as unknown as Record<string, unknown>,
          pathTokens,
        );
        if (!removed.removed) {
          throw new Error(`Config path not found: ${keyPath}`);
        }
        writeConsoleStoreConfig(shipConfig);
        printResult({
          asJson,
          success: true,
          title: "config value removed",
          payload: {
              scope: "console",
              consoleStorePath,
              keyPath,
              previous: removed.previous,
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
      return;
    }
    runConfigCommand(options, ({ config: shipConfig }) => {
      const removed = unsetByPath(
        shipConfig as unknown as Record<string, unknown>,
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
    .description("在 .zshrc / .bashrc 中写入 `alias sma=\"shipmyagent\"`")
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
