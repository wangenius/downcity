/**
 * Plugin Action CLI 注册器。
 *
 * 关键点（中文）
 * - 负责把 plugin actions 挂到 commander（`city <plugin> <action>`）。
 * - 仅处理 CLI 参数映射与远程调用，不承载 plugin 执行上下文或依赖状态逻辑。
 */

import path from "node:path";
import type { Command } from "commander";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { PLUGINS } from "@/main/plugin/Plugins.js";
import type { Plugin, PluginAction } from "@/types/Plugin.js";
import type { PluginActionResponse } from "@/types/PluginApi.js";
import { callServer } from "@/main/daemon/Client.js";
import { printResult } from "@utils/cli/CliOutput.js";
import { parsePortOption } from "@utils/cli/Checker.js";

type PluginCliBridgeOptions = {
  path?: string;
  host?: string;
  port?: number;
  token?: string;
  json?: boolean;
};

function resolveProjectRoot(pathInput?: string): string {
  return path.resolve(String(pathInput || "."));
}

function toJsonValue(input: unknown): JsonValue | undefined {
  if (input === null) return null;
  if (typeof input === "string") return input;
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : undefined;
  }
  if (typeof input === "boolean") return input;
  if (Array.isArray(input)) {
    const values: JsonValue[] = [];
    for (const item of input) {
      const value = toJsonValue(item);
      if (value === undefined) continue;
      values.push(value);
    }
    return values;
  }
  if (typeof input === "object" && input) {
    const output: JsonObject = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const normalized = toJsonValue(value);
      if (normalized === undefined) continue;
      output[key] = normalized;
    }
    return output;
  }
  return undefined;
}

function toPluginActionCommandOpts(
  options: Record<string, unknown>,
): Record<string, JsonValue> {
  const reservedKeys = new Set(["path", "host", "port", "token", "json"]);
  const normalized: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(options)) {
    if (reservedKeys.has(key)) continue;
    const nextValue = toJsonValue(value);
    if (nextValue === undefined) continue;
    normalized[key] = nextValue;
  }
  return normalized;
}

function toPluginCliBridgeOptions(
  options: Record<string, unknown>,
): PluginCliBridgeOptions {
  return {
    path: typeof options.path === "string" ? options.path : ".",
    host: typeof options.host === "string" ? options.host : undefined,
    port: typeof options.port === "number" ? options.port : undefined,
    token: typeof options.token === "string" ? options.token : undefined,
    json: options.json !== false,
  };
}

function flattenPluginActionCommandArgs(values: unknown[]): string[] {
  const out: string[] = [];
  const pushValue = (value: unknown): void => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) pushValue(item);
      return;
    }
    const text = String(value).trim();
    if (!text) return;
    out.push(text);
  };
  for (const value of values) {
    pushValue(value);
  }
  return out;
}

function isCommanderCommandLike(value: unknown): value is Command {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { opts?: unknown }).opts === "function",
  );
}

function isPlainOptionsObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { opts?: unknown }).opts !== "function",
  );
}

function registerPluginActionCommand(params: {
  program: Command;
  plugin: Plugin;
  actionName: string;
  action: PluginAction<JsonValue, JsonValue>;
}): void {
  const commandSpec = params.action.command;
  if (!commandSpec) return;

  const pluginCommand =
    params.program.commands.find((item) => item.name() === params.plugin.name) ||
    params.program
      .command(params.plugin.name)
      .description(`${params.plugin.name} plugin actions`)
      .helpOption("--help", "display help for command");

  const actionCommand = pluginCommand
    .command(params.actionName)
    .description(commandSpec.description)
    .helpOption("--help", "display help for command")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--token <token>", "覆盖 Bearer Token（默认自动读取 DC_AUTH_TOKEN 或本地登录态）")
    .option("--json [enabled]", "以 JSON 输出", true);

  commandSpec.configure?.(actionCommand);

  actionCommand.action(async (...rawArgs: unknown[]) => {
    const last = rawArgs.at(-1);
    const commandLike = isCommanderCommandLike(last) ? last : null;
    const positionalArgs = commandLike
      ? flattenPluginActionCommandArgs(
          Array.isArray(commandLike.processedArgs)
            ? (commandLike.processedArgs as unknown[])
            : [],
        )
      : (() => {
          const fallbackLast = rawArgs.at(-1);
          const fallbackPositional = isPlainOptionsObject(fallbackLast)
            ? rawArgs.slice(0, -1)
            : rawArgs;
          return flattenPluginActionCommandArgs(fallbackPositional);
        })();
    const allOptions = commandLike
      ? ((commandLike.opts() as Record<string, unknown>) || {})
      : (() => {
          const fallbackLast = rawArgs.at(-1);
          return isPlainOptionsObject(fallbackLast) ? fallbackLast : {};
        })();
    const actionOptions = toPluginActionCommandOpts(allOptions);
    const bridgeOptions = toPluginCliBridgeOptions(allOptions);

    let payload: JsonValue;
    try {
      payload = await commandSpec.mapInput({
        args: positionalArgs,
        opts: actionOptions,
      });
    } catch (error) {
      printResult({
        asJson: bridgeOptions.json,
        success: false,
        title: `${params.plugin.name}.${params.actionName} failed`,
        payload: {
          error: `Failed to parse command input: ${String(error)}`,
        },
      });
      return;
    }

    const remote = await callServer<PluginActionResponse>({
      projectRoot: resolveProjectRoot(bridgeOptions.path),
      path: "/api/plugins/action",
      method: "POST",
      host: bridgeOptions.host,
      port: bridgeOptions.port,
      authToken: bridgeOptions.token,
      body: {
        pluginName: params.plugin.name,
        actionName: params.actionName,
        payload,
      },
    });

    if (remote.success && remote.data) {
      const data = remote.data;
      printResult({
        asJson: bridgeOptions.json,
        success: Boolean(data.success),
        title: data.success
          ? `${params.plugin.name}.${params.actionName} ok`
          : `${params.plugin.name}.${params.actionName} failed`,
        payload: {
          ...(data.data !== undefined ? { data: data.data } : {}),
          ...(data.message ? { message: data.message } : {}),
          ...(data.error ? { error: data.error } : {}),
        },
      });
      return;
    }

    printResult({
      asJson: bridgeOptions.json,
      success: false,
      title: `${params.plugin.name}.${params.actionName} failed`,
      payload: {
        error:
          remote.error ||
          "Plugin action requires an active Agent server. Start via `city agent start` first.",
      },
    });
  });
}

/**
 * 注册全部 plugin actions 的 CLI 命令。
 */
export function registerAllPluginsForCli(program: Command): void {
  for (const plugin of PLUGINS) {
    for (const [actionName, action] of Object.entries(plugin.actions || {})) {
      registerPluginActionCommand({
        program,
        plugin,
        actionName,
        action,
      });
    }
  }
}
