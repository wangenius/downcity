/**
 * Runtime plugin action CLI 注册器。
 *
 * 关键点（中文）
 * - 负责把 runtime plugin actions 挂到 commander（`city <plugin> <action>`）。
 * - 仅处理 CLI 参数映射与远程调用，不承载 plugin 状态机逻辑。
 * - runtime plugin 注册表与调度时间解析统一复用 agent 包实现，避免 city 维护第二套事实源。
 */

import path from "node:path";
import type { Command } from "commander";
import {
  callAgentTransport,
  listRegisteredPlugins,
  parseScheduledRunAtMsOrThrow,
} from "@downcity/agent";
import type { BasePlugin, PluginAction } from "@downcity/agent";
import type { JsonObject, JsonValue } from "@downcity/agent";
import type { PluginCommandScheduleInput } from "@downcity/agent";
import type { PluginCommandResponse } from "@downcity/agent";
import type { PluginCliBaseOptions } from "@downcity/agent";
import { printResult } from "@/utils/cli/CliOutput.js";
import { parseBoolean, parsePort } from "./IndexSupport.js";
import { runPluginRuntimeControlCommand } from "./PluginRuntimeRemote.js";

const CHAT_PLUGIN_HELP_TEXT = [
  "",
  "Chat quick guide:",
  "  直接输出 assistant 文本会发送到当前 chat channel。",
  "  跨 chat 发送请使用 `city chat send --chat-key <chatKey>`。",
  "  如果要发正文/附件/定时消息，先看 `city chat send --help` 与 `city chat react --help`。",
  "",
  "Common examples:",
  "  city chat send --text 'done'",
  "  city chat send --chat-key <chatKey> --text 'done'",
  "  city chat react --message-id <messageId> --emoji '✅'",
  "  city chat context",
  "  city chat history --limit 30",
].join("\n");

const CHAT_HELP_HOOK_ATTACHED = Symbol("chat-help-hook-attached");

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
  const reservedKeys = new Set(["path", "host", "port", "token", "json", "delay", "time"]);
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

/**
 * 判断 command 是否已定义指定长参数。
 */
function hasLongOption(command: Command, longFlag: string): boolean {
  return command.options.some((item) => item.long === longFlag);
}

/**
 * 从 CLI 选项中提取通用调度输入。
 */
function extractCommandScheduleInput(
  options: Record<string, unknown>,
): PluginCommandScheduleInput | undefined {
  const runAtMs = parseScheduledRunAtMsOrThrow({
    delay: options.delay as string | number | undefined,
    time: options.time as string | number | undefined,
  });
  if (typeof runAtMs !== "number") return undefined;
  return { runAtMs };
}

function registerPluginActionCommand(params: {
  program: Command;
  plugin: BasePlugin;
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

  if (
    params.plugin.name === "chat" &&
    !(pluginCommand as Command & { [CHAT_HELP_HOOK_ATTACHED]?: boolean })[
      CHAT_HELP_HOOK_ATTACHED
    ]
  ) {
    const chatCommand = pluginCommand as Command & {
      [CHAT_HELP_HOOK_ATTACHED]?: boolean;
    };
    chatCommand.on("--help", () => {
      console.log(CHAT_PLUGIN_HELP_TEXT);
    });
    chatCommand[CHAT_HELP_HOOK_ATTACHED] = true;
  }

  const actionCommand = pluginCommand
    .command(params.actionName)
    .description(commandSpec.description)
    .helpOption("--help", "display help for command")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePort)
    .option("--token <token>", "覆盖 Bearer Token（仅远程 HTTP 调用需要；默认本地走 IPC）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean, true);

  commandSpec.configure?.(actionCommand);
  if (!hasLongOption(actionCommand, "--delay")) {
    actionCommand.option("--delay <ms>", "延迟执行毫秒数（所有 plugin action 通用）");
  }
  if (!hasLongOption(actionCommand, "--time")) {
    actionCommand.option(
      "--time <time>",
      "定时执行时间（Unix 时间戳秒/毫秒或 ISO 时间，所有 plugin action 通用）",
    );
  }

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
    let schedule: PluginCommandScheduleInput | undefined;
    try {
      schedule = extractCommandScheduleInput(allOptions);
    } catch (error) {
      printResult({
        asJson: bridgeOptions.json,
        success: false,
        title: `${params.plugin.name}.${params.actionName} failed`,
        payload: {
          error: `Failed to parse schedule input: ${String(error)}`,
        },
      });
      return;
    }

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

    const remote = await callAgentTransport<PluginCommandResponse>({
      projectRoot: resolveProjectRoot(bridgeOptions.path),
      path: "/api/plugins/runtime/command",
      method: "POST",
      host: bridgeOptions.host,
      port: bridgeOptions.port,
      authToken: bridgeOptions.token,
      body: {
        pluginName: params.plugin.name,
        command: params.actionName,
        payload,
        ...(schedule ? { schedule } : {}),
      } as unknown as JsonValue,
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
        error: remote.error || "Unknown error",
      },
    });
  });
}

function hasPluginSubcommand(command: Command, name: string): boolean {
  return command.commands.some((item) => item.name() === name);
}

function attachPluginLifecycleOptions(command: Command): Command {
  return command
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePort)
    .option("--token <token>", "覆盖 Bearer Token（仅远程 HTTP 调用需要；默认本地走 IPC）")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean, true);
}

function registerPluginLifecycleCommands(params: {
  program: Command;
  plugin: BasePlugin;
}): void {
  if (!params.plugin.lifecycle?.start && !params.plugin.lifecycle?.stop) {
    return;
  }

  const pluginCommand =
    params.program.commands.find((item) => item.name() === params.plugin.name) ||
    params.program
      .command(params.plugin.name)
      .description(`${params.plugin.name} plugin actions`)
      .helpOption("--help", "display help for command");

  const lifecycleCommands = [
    {
      name: "start",
      description: `启动 ${params.plugin.name} plugin`,
      action: "start" as const,
    },
    {
      name: "stop",
      description: `停止 ${params.plugin.name} plugin`,
      action: "stop" as const,
    },
    {
      name: "restart",
      description: `重启 ${params.plugin.name} plugin`,
      action: "restart" as const,
    },
    {
      name: "status",
      description: `查看 ${params.plugin.name} plugin 运行状态`,
      action: "status" as const,
    },
  ];

  for (const item of lifecycleCommands) {
    if (hasPluginSubcommand(pluginCommand, item.name)) {
      continue;
    }

    attachPluginLifecycleOptions(
      pluginCommand
        .command(item.name)
        .description(item.description)
        .helpOption("--help", "display help for command"),
    ).action(async (options: PluginCliBaseOptions) => {
      await runPluginRuntimeControlCommand({
        pluginName: params.plugin.name,
        action: item.action,
        options,
      });
    });
  }
}

/**
 * 注册所有 runtime plugin actions 的 CLI 命令。
 */
export function registerAllRuntimePluginsForCli(program: Command): void {
  const plugins = listRegisteredPlugins();
  for (const plugin of plugins) {
    for (const [actionName, action] of Object.entries(plugin.actions)) {
      registerPluginActionCommand({
        program,
        plugin,
        actionName,
        action: action as PluginAction<JsonValue, JsonValue>,
      });
    }
  }
  for (const plugin of plugins) {
    registerPluginLifecycleCommands({
      program,
      plugin,
    });
  }
}
