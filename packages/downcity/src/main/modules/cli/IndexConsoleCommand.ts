/**
 * CLI city/console 命令装配。
 *
 * 关键点（中文）
 * - 统一管理 top-level city 生命周期命令与 Console 模块命令。
 * - 本文件只保留命令树装配；runtime 与状态细节已拆到辅助模块。
 */

import type { Command } from "commander";
import {
  getConsoleRuntimeStatus,
  restartConsoleCommand,
  runConsoleRuntimeCommand,
  startConsoleCommand,
  stopConsoleCommand,
} from "./Console.js";
import { registerConfigCommand } from "./Config.js";
import { registerModelCommand } from "./Model.js";
import { consoleInitCommand } from "./ConsoleInit.js";
import { parseBoolean, parsePort, createVersionBanner } from "./IndexSupport.js";
import {
  consoleStatusCommand,
  printConsoleStatusPanel,
} from "./IndexConsoleStatus.js";
import {
  prepareForegroundAgent,
  ensureRegisteredAgentProjectRoot,
  restartCityRuntimeCommand,
  runCityRuntimeCommand,
  startCityRuntimeCommand,
  stopCityRuntimeCommand,
} from "./IndexConsoleProcess.js";

/**
 * top-level city/Console 命令注册参数。
 */
export interface ConsoleCommandRegistrationContext {
  /** 当前 CLI 版本号。 */
  version: string;
  /** 当前 CLI 入口文件绝对路径。 */
  cliPath: string;
}

/**
 * 注册 top-level city 生命周期命令与 `console` 模块命令。
 */
export function registerConsoleCommands(
  program: Command,
  context: ConsoleCommandRegistrationContext,
): void {
  program
    .command("init")
    .description("初始化 city 全局配置（模型/插件等，写入 ~/.downcity/downcity.db）")
    .option("--force [enabled]", "允许清空并重建 ~/.downcity/downcity.db 中的 console 数据（危险操作）", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (options: { force?: boolean }) => {
      await consoleInitCommand(options);
    }));

  program
    .command("start")
    .description("启动 city runtime；使用 -a/--all 或 --console 可同时启动 Console")
    .option("-a, --all", "同时启动 Console")
    .option("--console", "同时启动 Console")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (
      _options: { all?: boolean; console?: boolean },
      command: Command,
    ) => {
      const options = command.opts<{ all?: boolean; console?: boolean }>();
      const shouldStartConsole = options?.all === true || options?.console === true;
      await startCityRuntimeCommand(context.cliPath);
      if (shouldStartConsole) {
        await startConsoleCommand({
          cliPath: context.cliPath,
        });
      }
    }));

  program
    .command("stop")
    .description("停止 CITY（先停 Console，再停 city 后台与受管 agent）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await stopCityRuntimeCommand();
    }));

  program
    .command("restart")
    .description("重启 CITY（重启 city 后台并恢复已运行 agent，再拉起 Console）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await restartCityRuntimeCommand(context.cliPath);
      await startConsoleCommand({
        cliPath: context.cliPath,
      });
    }));

  program
    .command("status")
    .description("查看 city 后台、Console 与已托管 agent 运行状态")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await consoleStatusCommand();
    }));

  program
    .command("run", { hidden: true })
    .description("internal city runtime")
    .action(runCityRuntimeCommand);

  const consoleCommand = program
    .command("console [action]")
    .description("管理 Console 模块（start/stop/restart/status，默认 start）")
    .option("-p, --port <port>", "Console 端口（默认 5315）", parsePort)
    .option("-h, --host <host>", "Console 主机（默认 127.0.0.1）")
    .helpOption("--help", "display help for command");

  consoleCommand
    .action(
      createVersionBanner(
        context.version,
        async (
          action: string | undefined,
          _options: { port?: number; host?: string },
          command: Command,
        ) => {
          const options = command.opts<{ port?: number; host?: string }>();
          const resolvedAction = String(action || "start").trim().toLowerCase();
          if (resolvedAction === "start") {
            await startConsoleCommand({
              options,
              cliPath: context.cliPath,
            });
            return;
          }
          if (resolvedAction === "run") {
            await runConsoleRuntimeCommand(options);
            return;
          }
          if (resolvedAction === "stop") {
            await stopConsoleCommand();
            return;
          }
          if (resolvedAction === "restart") {
            await restartConsoleCommand({
              options,
              cliPath: context.cliPath,
            });
            return;
          }
          if (resolvedAction === "status") {
            const status = await getConsoleRuntimeStatus();
            printConsoleStatusPanel(status);
            return;
          }
          console.error(
            `❌ Unknown action: ${resolvedAction}. Use start|stop|restart|status.`,
          );
          process.exit(1);
        },
      ),
    );

  registerConfigCommand(program);
  registerModelCommand(program);
}

export {
  ensureRegisteredAgentProjectRoot,
  prepareForegroundAgent,
};
