/**
 * `city service` 命令组。
 *
 * 关键点（中文）
 * - 统一管理 service 状态：list/status/start/stop/restart。
 * - 所有 service 默认支持 command 桥接（含内建 lifecycle 命令）。
 * - 远程 agent 调用与 schedule 管理细节已经拆到独立子模块。
 */

import type { Command } from "commander";
import type { ServiceCliBaseOptions, ServiceControlAction } from "@/shared/types/Services.js";
import {
  addServiceTargetOptions,
} from "./ServiceCommandSupport.js";
import {
  runServiceCommandBridge,
  runServiceControlCommand,
  runServiceListCommand,
} from "./ServiceCommandRemote.js";
import { registerServiceScheduleCommands } from "./ServiceScheduleCommand.js";

function registerLifecycleCommand(
  service: Command,
  action: Exclude<ServiceControlAction, "status"> | "status",
  description: string,
): void {
  addServiceTargetOptions(
    service
      .command(`${action} <serviceName>`)
      .description(description),
  ).action(async (serviceName: string, opts: ServiceCliBaseOptions) => {
    await runServiceControlCommand({
      serviceName,
      action,
      options: opts,
    });
  });
}

/**
 * 注册 `service` 命令组。
 */
export function registerServicesCommand(program: Command): void {
  const service = program
    .command("service")
    .description("Service 状态管理命令")
    .helpOption("--help", "display help for command");

  addServiceTargetOptions(
    service
      .command("list")
      .description("列出全部 service 运行状态"),
  ).action(async (opts: ServiceCliBaseOptions) => {
    await runServiceListCommand(opts);
  });

  registerLifecycleCommand(service, "status", "查看单个 service 状态");
  registerLifecycleCommand(service, "start", "启动 service");
  registerLifecycleCommand(service, "stop", "停止 service");
  registerLifecycleCommand(service, "restart", "重启 service");

  addServiceTargetOptions(
    service
      .command("command <serviceName> <command>")
      .description("转发 service command")
      .option("--payload <json>", "可选 payload（JSON 字符串或普通字符串）"),
  ).action(
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
