/**
 * `sma extension` 命令组。
 *
 * 关键点（中文）
 * - 统一管理 extension runtime：list/status/start/stop/restart。
 * - 所有 extension 默认支持 command 桥接（含内建 lifecycle 命令）。
 */

import path from "node:path";
import type { Command } from "commander";
import { callServer } from "@/console/daemon/Client.js";
import { printResult } from "@/agent/utils/CliOutput.js";
import type { JsonValue } from "@/types/Json.js";
import type {
  ExtensionCliBaseOptions,
  ExtensionCommandResponse,
  ExtensionControlAction,
  ExtensionControlResponse,
  ExtensionListResponse,
} from "@/agent/types/Extensions.js";

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
  return path.resolve(String(pathInput || "."));
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

async function runExtensionListCommand(
  options: ExtensionCliBaseOptions,
): Promise<void> {
  const projectRoot = resolveProjectRoot(options.path);
  const remote = await callServer<ExtensionListResponse>({
    projectRoot,
    path: "/api/extensions/list",
    method: "GET",
    host: options.host,
    port: options.port,
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success
        ? "extensions listed"
        : "extension list failed",
      payload: {
        ...(Array.isArray(remote.data.extensions)
          ? { extensions: remote.data.extensions }
          : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: options.json,
    success: false,
    title: "extension list failed",
    payload: {
      error:
        remote.error ||
        "Extension list requires an active Agent server runtime. Start via `sma agent start` first.",
    },
  });
}

async function runExtensionControlCommand(params: {
  extensionName: string;
  action: ExtensionControlAction;
  options: ExtensionCliBaseOptions;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(params.options.path);
  const remote = await callServer<ExtensionControlResponse>({
    projectRoot,
    path: "/api/extensions/control",
    method: "POST",
    host: params.options.host,
    port: params.options.port,
    body: {
      extensionName: params.extensionName,
      action: params.action,
    },
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: params.options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success
        ? `extension ${params.action} ok`
        : `extension ${params.action} failed`,
      payload: {
        ...(remote.data.extension ? { extension: remote.data.extension } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: params.options.json,
    success: false,
    title: `extension ${params.action} failed`,
    payload: {
      error:
        remote.error ||
        `Extension ${params.action} requires an active Agent server runtime. Start via \`sma agent start\` first.`,
    },
  });
}

async function runExtensionCommandBridge(params: {
  extensionName: string;
  command: string;
  payloadRaw?: string;
  options: ExtensionCliBaseOptions;
}): Promise<void> {
  const projectRoot = resolveProjectRoot(params.options.path);
  const remote = await callServer<ExtensionCommandResponse>({
    projectRoot,
    path: "/api/extensions/command",
    method: "POST",
    host: params.options.host,
    port: params.options.port,
    body: {
      extensionName: params.extensionName,
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
      title: remote.data.success
        ? "extension command ok"
        : "extension command failed",
      payload: {
        ...(remote.data.extension ? { extension: remote.data.extension } : {}),
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
    title: "extension command failed",
    payload: {
      error:
        remote.error ||
        "Extension command requires an active Agent server runtime. Start via `sma agent start` first.",
    },
  });
}

/**
 * 注册 `extension` 命令组。
 */
export function registerExtensionsCommand(program: Command): void {
  const extension = program
    .command("extension")
    .description("Extension runtime 管理命令")
    .helpOption("--help", "display help for command");

  extension
    .command("list")
    .description("列出全部 extension 运行状态")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (opts: ExtensionCliBaseOptions) => {
      await runExtensionListCommand(opts);
    });

  extension
    .command("status <extensionName>")
    .description("查看单个 extension 状态")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (extensionName: string, opts: ExtensionCliBaseOptions) => {
      await runExtensionControlCommand({
        extensionName,
        action: "status",
        options: opts,
      });
    });

  extension
    .command("start <extensionName>")
    .description("启动 extension")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (extensionName: string, opts: ExtensionCliBaseOptions) => {
      await runExtensionControlCommand({
        extensionName,
        action: "start",
        options: opts,
      });
    });

  extension
    .command("stop <extensionName>")
    .description("停止 extension")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (extensionName: string, opts: ExtensionCliBaseOptions) => {
      await runExtensionControlCommand({
        extensionName,
        action: "stop",
        options: opts,
      });
    });

  extension
    .command("restart <extensionName>")
    .description("重启 extension")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (extensionName: string, opts: ExtensionCliBaseOptions) => {
      await runExtensionControlCommand({
        extensionName,
        action: "restart",
        options: opts,
      });
    });

  extension
    .command("command <extensionName> <command>")
    .description("转发 extension command")
    .option("--payload <json>", "可选 payload（JSON 字符串或普通字符串）")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(
      async (
        extensionName: string,
        command: string,
        opts: ExtensionCliBaseOptions & { payload?: string },
      ) => {
        await runExtensionCommandBridge({
          extensionName,
          command,
          payloadRaw: opts.payload,
          options: opts,
        });
      },
    );
}
