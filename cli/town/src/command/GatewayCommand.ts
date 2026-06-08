/**
 * Town runtime 命令装配模块。
 *
 * 关键点（中文）
 * - Town CLI 不再启动 Console UI 项目；`town start` 只负责本机 runtime。
 * - 旧 gateway 源码暂时保留给历史 API/清理逻辑，但不再挂到用户命令入口。
 * - 本文件只保留命令树装配；runtime 与状态细节已拆到辅助模块。
 */

import { Command } from "commander";
import { registerConfigCommand } from "./ConfigCommand.js";
import { registerEnvCommand } from "./EnvCommand.js";
import { registerTokenCommand } from "./TokenCommand.js";
import { registerCityConnectionCommand } from "./CityCommand.js";
import { gatewayInitCommand } from "../town/gateway/runtime/GatewayInit.js";
import { createVersionBanner } from "../shared/IndexSupport.js";
import { CliError } from "../shared/CliError.js";
import { updateCommand } from "../shared/Update.js";
import {
  gatewayStatusCommand,
} from "../town/gateway/runtime/GatewayStatus.js";
import {
  prepareForegroundAgent,
  ensureRegisteredAgentProjectRoot,
  restartTownRuntimeCommand,
  runTownRuntimeCommand,
  startTownRuntimeCommand,
  stopTownRuntimeCommand,
} from "../town/gateway/runtime/GatewayProcess.js";
import { helpText, t } from "../shared/CliLocale.js";

/**
 * top-level town/gateway 命令注册参数。
 */
export interface GatewayCommandRegistrationContext {
  /** 当前 CLI 版本号。 */
  version: string;
  /** 当前 CLI 入口文件绝对路径。 */
  cliPath: string;
}

/**
 * 注册 top-level town 生命周期命令。
 *
 * 语义说明（中文）
 * - `town ...` 管的是本机宿主 runtime 与受管 agent。
 * - Console UI 已从 Town 启动链路断开，不再提供 `town console` / `town public` 入口。
 */
export function registerGatewayCommands(
  program: Command,
  context: GatewayCommandRegistrationContext,
): void {
  program
    .command("init")
    .description(t({
      zh: "初始化 Town 全局配置（插件、env、账号等，写入 ~/.downcity/downcity.db）",
      en: "initialize Town global state (plugins, env, accounts, etc.) in ~/.downcity/downcity.db",
    }))
    .helpOption("--help", helpText())
    .action(createVersionBanner(context.version, async () => {
      await gatewayInitCommand();
    }));

  program
    .command("start")
    .description(t({
      zh: "启动 town runtime（不启动 Console UI）",
      en: "start the Town runtime without starting the Console UI",
    }))
    .helpOption("--help", helpText())
    .action(createVersionBanner(context.version, async () => {
      await startTownRuntimeCommand(context.cliPath);
    }));

  program
    .command("stop")
    .description(t({
      zh: "停止 Town runtime 与受管 agent",
      en: "stop the Town runtime and managed agents",
    }))
    .helpOption("--help", helpText())
    .action(createVersionBanner(context.version, async () => {
      await stopTownRuntimeCommand();
    }));

  program
    .command("restart")
    .description(t({
      zh: "重启 Town runtime 并恢复已运行 agent",
      en: "restart the Town runtime and recover running agents",
    }))
    .helpOption("--help", helpText())
    .action(createVersionBanner(context.version, async () => {
      await restartTownRuntimeCommand(context.cliPath);
    }));

  program
    .command("status")
    .description(t({
      zh: "查看 town runtime 与已托管 agent 运行状态",
      en: "show Town runtime and managed agent status",
    }))
    .helpOption("--help", helpText())
    .action(createVersionBanner(context.version, async () => {
      await gatewayStatusCommand();
    }));

  program
    .command("update")
    .description(t({
      zh: "更新全局 downcity CLI 到最新版本",
      en: "update the global downcity CLI to the latest version",
    }))
    .option("--manager <manager>", t({
      zh: "指定包管理器（npm|pnpm|auto）",
      en: "choose the package manager (npm|pnpm|auto)",
    }), "auto")
    .helpOption("--help", helpText())
    .action(createVersionBanner(context.version, async (
      _options: { manager?: string },
      command: Command,
    ) => {
      const options = command.opts<{ manager?: string }>();
      const manager = String(options.manager || "auto").trim().toLowerCase();
      if (manager !== "auto" && manager !== "npm" && manager !== "pnpm") {
        throw new CliError({
          title: `Invalid manager: ${manager}`,
          fix: "Use npm|pnpm|auto.",
        });
      }
      await updateCommand({
        manager: manager as "auto" | "npm" | "pnpm",
      });
    }));

  program
    .command("run", { hidden: true })
    .description(t({
      zh: "Town 内部运行时（不直接使用）",
      en: "Town internal runtime (not for direct use)",
    }))
    .action(runTownRuntimeCommand);

  registerConfigCommand(program);
  registerEnvCommand(program);
  registerTokenCommand(program);
  registerCityConnectionCommand(program);
}

export {
  ensureRegisteredAgentProjectRoot,
  prepareForegroundAgent,
};
