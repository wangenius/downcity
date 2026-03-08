/**
 * Service action CLI 注册器。
 *
 * 关键点（中文）
 * - 负责把 service actions 挂到 commander（`sma <service> <action>`）。
 * - 仅处理 CLI 参数映射与远程调用，不承载 service runtime 状态机逻辑。
 */

import path from "node:path";
import type { Command } from "commander";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { SERVICES } from "@main/service/Services.js";
import type { Service, ServiceAction } from "@main/service/ServiceManager.js";
import type { ServiceCommandResponse } from "@main/types/Services.js";
import { callServer } from "@/main/server/daemon/Client.js";
import { printResult } from "@main/utils/CliOutput.js";
import { parsePortOption } from "@main/utils/Checker.js";

type ServiceCliBridgeOptions = {
  path?: string;
  host?: string;
  port?: number;
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

function toServiceActionCommandOpts(
  options: Record<string, unknown>,
): Record<string, JsonValue> {
  const reservedKeys = new Set(["path", "host", "port", "json"]);
  const normalized: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(options)) {
    if (reservedKeys.has(key)) continue;
    const nextValue = toJsonValue(value);
    if (nextValue === undefined) continue;
    normalized[key] = nextValue;
  }
  return normalized;
}

function toServiceCliBridgeOptions(
  options: Record<string, unknown>,
): ServiceCliBridgeOptions {
  return {
    path: typeof options.path === "string" ? options.path : ".",
    host: typeof options.host === "string" ? options.host : undefined,
    port: typeof options.port === "number" ? options.port : undefined,
    json: options.json !== false,
  };
}

function flattenServiceActionCommandArgs(values: unknown[]): string[] {
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

function registerServiceActionCommand(params: {
  program: Command;
  service: Service;
  actionName: string;
  action: ServiceAction<JsonValue, JsonValue>;
}): void {
  const commandSpec = params.action.command;
  if (!commandSpec) return;

  const serviceCommand =
    params.program.commands.find((item) => item.name() === params.service.name) ||
    params.program
      .command(params.service.name)
      .description(`${params.service.name} service actions`)
      .helpOption("--help", "display help for command");

  const actionCommand = serviceCommand
    .command(params.actionName)
    .description(commandSpec.description)
    .helpOption("--help", "display help for command")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true);

  commandSpec.configure?.(actionCommand);

  actionCommand.action(async (...rawArgs: unknown[]) => {
    const last = rawArgs.at(-1);
    const commandLike = isCommanderCommandLike(last) ? last : null;
    const positionalArgs = commandLike
      ? flattenServiceActionCommandArgs(
          Array.isArray(commandLike.processedArgs)
            ? (commandLike.processedArgs as unknown[])
            : [],
        )
      : (() => {
          const fallbackLast = rawArgs.at(-1);
          const fallbackPositional = isPlainOptionsObject(fallbackLast)
            ? rawArgs.slice(0, -1)
            : rawArgs;
          return flattenServiceActionCommandArgs(fallbackPositional);
        })();
    const allOptions = commandLike
      ? ((commandLike.opts() as Record<string, unknown>) || {})
      : (() => {
          const fallbackLast = rawArgs.at(-1);
          return isPlainOptionsObject(fallbackLast) ? fallbackLast : {};
        })();
    const actionOptions = toServiceActionCommandOpts(allOptions);
    const bridgeOptions = toServiceCliBridgeOptions(allOptions);

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
        title: `${params.service.name}.${params.actionName} failed`,
        payload: {
          error: `Failed to parse command input: ${String(error)}`,
        },
      });
      return;
    }

    const remote = await callServer<ServiceCommandResponse>({
      projectRoot: resolveProjectRoot(bridgeOptions.path),
      path: "/api/services/command",
      method: "POST",
      host: bridgeOptions.host,
      port: bridgeOptions.port,
      body: {
        serviceName: params.service.name,
        command: params.actionName,
        payload,
      },
    });

    if (remote.success && remote.data) {
      const data = remote.data;
      printResult({
        asJson: bridgeOptions.json,
        success: Boolean(data.success),
        title: data.success
          ? `${params.service.name}.${params.actionName} ok`
          : `${params.service.name}.${params.actionName} failed`,
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
      title: `${params.service.name}.${params.actionName} failed`,
      payload: {
        error:
          remote.error ||
          "Service action requires an active Agent server runtime. Start via `sma agent on --daemon` first.",
      },
    });
  });
}

/**
 * 注册所有 service actions 的 CLI 命令。
 */
export function registerAllServicesForCli(program: Command): void {
  for (const service of SERVICES) {
    for (const [actionName, action] of Object.entries(service.actions)) {
      registerServiceActionCommand({
        program,
        service,
        actionName,
        action,
      });
    }
  }
}
