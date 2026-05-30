/**
 * CLI studio/control-plane 命令装配。
 *
 * 关键点（中文）
 * - 这里的 `console` 更接近 Studio gateway / control plane 的运维入口，而不是单 agent API。
 * - 统一管理 top-level studio 生命周期命令与 control plane 模块命令。
 * - 本文件只保留命令树装配；runtime 与状态细节已拆到辅助模块。
 */

import { Command, Option } from "commander";
import {
  getControlPlaneRuntimeStatus,
  restartControlPlaneCommand,
  runControlPlaneRuntimeCommand,
  startControlPlaneCommand,
  stopControlPlaneCommand,
} from "./ControlPlaneRuntime.js";
import {
  controlPlanePublicCommand,
} from "./ControlPlanePublicManager.js";
import { registerConfigCommand } from "../shared/Config.js";
import { registerEnvCommand } from "../shared/Env.js";
import { registerTokenCommand } from "../shared/Token.js";
import { registerModelCommand } from "../model/Model.js";
import { controlPlaneInitCommand } from "./ControlPlaneInit.js";
import { parseBoolean, parsePort, createVersionBanner } from "../shared/IndexSupport.js";
import { CliError } from "../shared/CliError.js";
import { updateCommand } from "../shared/Update.js";
import {
  controlPlaneStatusCommand,
  printControlPlaneStatusPanel,
} from "./ControlPlaneStatus.js";
import {
  prepareForegroundAgent,
  ensureRegisteredAgentProjectRoot,
  restartCityRuntimeCommand,
  runCityRuntimeCommand,
  startCityRuntimeCommand,
  stopCityRuntimeCommand,
} from "./ControlPlaneProcess.js";
import {
  shouldAutoStartControlPlaneFromPersistedMode,
} from "./ControlPlanePublicMode.js";

/**
 * top-level studio/control-plane 命令注册参数。
 */
export interface ControlPlaneCommandRegistrationContext {
  /** 当前 CLI 版本号。 */
  version: string;
  /** 当前 CLI 入口文件绝对路径。 */
  cliPath: string;
}

/**
 * 注册 top-level studio 生命周期命令与 `console` 模块命令。
 *
 * 语义说明（中文）
 * - `studio ...` / `studio console ...` 管的是本机宿主与平台控制面进程。
 * - 单 agent 控制能力统一留在 `@downcity/agent` 暴露的 runtime / HTTP control API。
 */
export function registerControlPlaneCommands(
  program: Command,
  context: ControlPlaneCommandRegistrationContext,
): void {
  program
    .command("init")
    .description("初始化 Studio 全局配置（模型/插件等，写入 ~/.downcity/downcity.db）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await controlPlaneInitCommand();
    }));

  program
    .command("start")
    .description("启动 studio runtime；使用 -a/--all、--console 或 -p/--public 可同时启动 Console")
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
        (!hasExplicitPublic && (await shouldAutoStartControlPlaneFromPersistedMode()));
      await startCityRuntimeCommand(context.cliPath);
      if (shouldStartConsole) {
        await startControlPlaneCommand({
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
    .description("停止 Studio（先停 Console，再停 studio 后台与受管 agent）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await stopCityRuntimeCommand();
    }));

  program
    .command("restart")
    .description("重启 Studio（重启 studio 后台并恢复已运行 agent，再拉起 Console）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await restartCityRuntimeCommand(context.cliPath);
      await startControlPlaneCommand({
        cliPath: context.cliPath,
      });
    }));

  program
    .command("status")
    .description("查看 studio 后台、Console 与已托管 agent 运行状态")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await controlPlaneStatusCommand();
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
      await controlPlanePublicCommand({
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
    .description("Studio 内部运行时（不直接使用）")
    .action(runCityRuntimeCommand);

  const consoleCommand = program
    .command("console [action]")
    .description("管理控制面模块（命令名保留为 console；start/stop/restart/status，默认 start）")
    .option("-p, --public [enabled]", "以公网模式启动控制面（绑定 0.0.0.0）", parseBoolean)
    .option("-h, --host <host>", "控制面主机（默认 127.0.0.1）")
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
            await startControlPlaneCommand({
              options,
              cliPath: context.cliPath,
            });
            return;
          }
          if (resolvedAction === "run") {
            await runControlPlaneRuntimeCommand(options);
            return;
          }
          if (resolvedAction === "stop") {
            await stopControlPlaneCommand();
            return;
          }
          if (resolvedAction === "restart") {
            await restartControlPlaneCommand({
              options,
              cliPath: context.cliPath,
            });
            return;
          }
          if (resolvedAction === "status") {
            const status = await getControlPlaneRuntimeStatus();
            printControlPlaneStatusPanel(status);
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
  registerModelCommand(program);
}

export {
  ensureRegisteredAgentProjectRoot,
  prepareForegroundAgent,
};
