/**
 * `city service` 命令组。
 *
 * 关键点（中文）
 * - `city service` 现在承担 console 侧静态 service catalog 入口。
 * - `list/status` 不依赖 agent，仅展示已注册 service 的静态能力。
 * - 具体 agent runtime lifecycle 应优先通过 `city <service>` 命令访问。
 */

import type { Command } from "commander";
import { listRegisteredServices } from "@/main/service/ServiceClassRegistry.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import type { Service } from "@/shared/types/Service.js";
import {
  runServiceCommandBridge,
  runServiceControlCommand,
} from "./ServiceCommandRemote.js";
import { registerServiceScheduleCommands } from "./ServiceScheduleCommand.js";
import type { ServiceCliBaseOptions } from "@/shared/types/Services.js";

function toStaticServiceView(service: Service): {
  name: string;
  scope: "agent";
  supportsLifecycle: boolean;
  supportsCommand: boolean;
  actions: string[];
} {
  return {
    name: service.name,
    scope: "agent",
    supportsLifecycle: Boolean(service.lifecycle?.start || service.lifecycle?.stop),
    supportsCommand: Object.keys(service.actions || {}).length > 0 || Boolean(service.lifecycle?.command),
    actions: Object.keys(service.actions || {}).sort((left, right) => left.localeCompare(right)),
  };
}

function printStaticServiceList(params?: {
  asJson?: boolean;
}): void {
  const services = listRegisteredServices()
    .map((service) => toStaticServiceView(service))
    .sort((left, right) => left.name.localeCompare(right.name));
  printResult({
    asJson: params?.asJson,
    success: true,
    title: "service catalog",
    payload: {
      count: services.length,
      services,
    },
  });
}

function printStaticServiceStatus(params: {
  serviceName: string;
  asJson?: boolean;
}): void {
  const service = listRegisteredServices().find((item) => item.name === params.serviceName);
  if (!service) {
    printResult({
      asJson: params.asJson,
      success: false,
      title: "service status failed",
      payload: {
        error: `Unknown service: ${params.serviceName}`,
      },
    });
    return;
  }

  printResult({
    asJson: params.asJson,
    success: true,
    title: "service status",
    payload: {
      service: toStaticServiceView(service),
    },
  });
}

/**
 * 注册 `service` 命令组。
 */
export function registerServicesCommand(program: Command): void {
  const service = program
    .command("service")
    .description("查看 service catalog，并提供高级 agent 定向入口")
    .helpOption("--help", "display help for command");

  service
    .command("list")
    .description("列出全部已注册 service 的静态能力")
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (opts: { json?: boolean }) => {
      printStaticServiceList({
        asJson: opts.json !== false,
      });
    });

  service
    .command("status <serviceName>")
    .description("查看单个 service 的静态能力")
    .option("--json [enabled]", "以 JSON 输出", true)
    .action(async (serviceName: string, opts: { json?: boolean }) => {
      printStaticServiceStatus({
        serviceName,
        asJson: opts.json !== false,
      });
    });

  service
    .command("start <serviceName>")
    .description("高级用法：按 agent 目标启动 service")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）")
    .option("--token <token>", "覆盖 Bearer Token（仅远程 HTTP 调用需要；默认本地走 IPC）")
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
    .description("高级用法：按 agent 目标停止 service")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）")
    .option("--token <token>", "覆盖 Bearer Token（仅远程 HTTP 调用需要；默认本地走 IPC）")
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
    .description("高级用法：按 agent 目标重启 service")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）")
    .option("--token <token>", "覆盖 Bearer Token（仅远程 HTTP 调用需要；默认本地走 IPC）")
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
    .description("高级用法：按 agent 目标转发 service command")
    .option("--payload <json>", "可选 payload（JSON 字符串或普通字符串）")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--agent <name>", "agent 名称（从 console registry 解析）")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）")
    .option("--token <token>", "覆盖 Bearer Token（仅远程 HTTP 调用需要；默认本地走 IPC）")
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

  registerServiceScheduleCommands(service);
}
