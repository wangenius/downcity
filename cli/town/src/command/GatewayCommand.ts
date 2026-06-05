/**
 * Town gateway 命令装配模块。
 *
 * 关键点（中文）
 * - 这里的 `console` 是 Town gateway 的运维入口，而不是单 agent API。
 * - 统一管理 top-level town 生命周期命令与 gateway 模块命令。
 * - 本文件只保留命令树装配；runtime 与状态细节已拆到辅助模块。
 */

import { Command, Option } from "commander";
import {
  getGatewayRuntimeStatus,
  restartGatewayRuntimeCommand,
  runGatewayRuntimeCommand,
  startGatewayRuntimeCommand,
  stopGatewayRuntimeCommand,
} from "../town/gateway/runtime/GatewayRuntime.js";
import {
  gatewayPublicCommand,
} from "../town/gateway/runtime/GatewayPublicManager.js";
import { registerConfigCommand } from "./ConfigCommand.js";
import { registerEnvCommand } from "./EnvCommand.js";
import { registerTokenCommand } from "./TokenCommand.js";
import { registerCityConnectionCommand } from "./CityCommand.js";
import { gatewayInitCommand } from "../town/gateway/runtime/GatewayInit.js";
import { parseBoolean, parsePort, createVersionBanner } from "../shared/IndexSupport.js";
import { CliError } from "../shared/CliError.js";
import { updateCommand } from "../shared/Update.js";
import {
  gatewayStatusCommand,
  printGatewayStatusPanel,
} from "../town/gateway/runtime/GatewayStatus.js";
import {
  prepareForegroundAgent,
  ensureRegisteredAgentProjectRoot,
  restartTownRuntimeCommand,
  runTownRuntimeCommand,
  startTownRuntimeCommand,
  stopTownRuntimeCommand,
} from "../town/gateway/runtime/GatewayProcess.js";
import {
  shouldAutoStartGatewayFromPersistedMode,
} from "../town/gateway/runtime/GatewayPublicMode.js";

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
 * 注册 top-level town 生命周期命令与 `console` 模块命令。
 *
 * 语义说明（中文）
 * - `town ...` / `town console ...` 管的是本机宿主与 Town gateway 进程。
 * - 单 agent 控制能力统一由 Town 基于 Agent runtime / RPC 装配外层协议面。
 */
export function registerGatewayCommands(
  program: Command,
  context: GatewayCommandRegistrationContext,
): void {
  program
    .command("init")
    .description("初始化 Town 全局配置（插件、env、账号等，写入 ~/.downcity/downcity.db）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await gatewayInitCommand();
    }));

  program
    .command("start")
    .description("启动 town runtime；使用 -a/--all、--console 或 -p/--public 可同时启动 Console")
    .option("-a, --all", "同时启动 Console")
    .option("--console", "同时启动 Console")
    .option("-p, --public [enabled]", "以公网模式启动 Console（绑定 0.0.0.0）", parseBoolean)
    .option("-h, --host <host>", "Console 主机；传入后默认同时启动 Console")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (
      _options: { all?: boolean; console?: boolean; public?: boolean; host?: string },
      command: Command,
    ) => {
      const options = command.opts<{
        all?: boolean;
        console?: boolean;
        public?: boolean;
        host?: string;
      }>();
      const hasExplicitHost = Boolean(String(options?.host || "").trim());
      const hasExplicitPublic = typeof options?.public === "boolean";
      const shouldStartConsole =
        options?.all === true ||
        options?.console === true ||
        options?.public === true ||
        hasExplicitHost ||
        (!hasExplicitPublic && (await shouldAutoStartGatewayFromPersistedMode()));
      await startTownRuntimeCommand(context.cliPath);
      if (shouldStartConsole) {
        await startGatewayRuntimeCommand({
          options: {
            public: options?.public,
            host: options?.host,
          },
          cliPath: context.cliPath,
        });
      }
    }));

  program
    .command("stop")
    .description("停止 Town（先停 Console，再停 town 后台与受管 agent）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await stopTownRuntimeCommand();
    }));

  program
    .command("restart")
    .description("重启 Town（重启 town 后台并恢复已运行 agent，再拉起 Console）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await restartTownRuntimeCommand(context.cliPath);
      await startGatewayRuntimeCommand({
        cliPath: context.cliPath,
      });
    }));

  program
    .command("status")
    .description("查看 town 后台、Console 与已托管 agent 运行状态")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await gatewayStatusCommand();
    }));

  program
    .command("public [action]")
    .description("管理 Console 公网模式（支持交互式 manager 与 on/off/status）")
    .option("-h, --host <host>", "公网模式绑定 host（默认 0.0.0.0）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (
      action: string | undefined,
      _options: { host?: string },
      command: Command,
    ) => {
      const options = command.opts<{ host?: string }>();
      await gatewayPublicCommand({
        action,
        host: options.host,
        cliPath: context.cliPath,
      });
    }));

  program
    .command("update")
    .description("更新全局 downcity CLI 到最新版本")
    .option("--manager <manager>", "指定包管理器（npm|pnpm|auto）", "auto")
    .helpOption("--help", "display help for command")
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
    .description("Town 内部运行时（不直接使用）")
    .action(runTownRuntimeCommand);

  const consoleCommand = program
    .command("console [action]")
    .description("管理 Town gateway（命令名保留为 console；start/stop/restart/status，默认 start）")
    .option("-p, --public [enabled]", "以公网模式启动 Town gateway（绑定 0.0.0.0）", parseBoolean)
    .option("-h, --host <host>", "Town gateway 主机（默认 127.0.0.1）")
    .addOption(new Option("--port <port>").argParser(parsePort).hideHelp())
    .helpOption("--help", "display help for command");

  consoleCommand
    .action(
      createVersionBanner(
        context.version,
        async (
          action: string | undefined,
          _options: { public?: boolean; host?: string; port?: number },
          command: Command,
        ) => {
          const options = command.opts<{ public?: boolean; host?: string; port?: number }>();
          const resolvedAction = String(action || "start").trim().toLowerCase();
          if (resolvedAction === "start") {
            await startGatewayRuntimeCommand({
              options,
              cliPath: context.cliPath,
            });
            return;
          }
          if (resolvedAction === "run") {
            await runGatewayRuntimeCommand(options);
            return;
          }
          if (resolvedAction === "stop") {
            await stopGatewayRuntimeCommand();
            return;
          }
          if (resolvedAction === "restart") {
            await restartGatewayRuntimeCommand({
              options,
              cliPath: context.cliPath,
            });
            return;
          }
          if (resolvedAction === "status") {
            const status = await getGatewayRuntimeStatus();
            printGatewayStatusPanel(status);
            return;
          }
          throw new CliError({
            title: `Unknown action: ${resolvedAction}`,
            fix: "Use start|stop|restart|status.",
          });
        },
      ),
    );

  registerConfigCommand(program);
  registerEnvCommand(program);
  registerTokenCommand(program);
  registerCityConnectionCommand(program);
}

export {
  ensureRegisteredAgentProjectRoot,
  prepareForegroundAgent,
};
