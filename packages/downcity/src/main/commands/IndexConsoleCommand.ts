/**
 * CLI console 命令装配。
 *
 * 关键点（中文）
 * - 统一管理 top-level CITY/console 生命周期命令与 console 子命令树。
 * - 本文件只保留命令树装配；runtime 与状态细节已拆到辅助模块。
 */

import type { Command } from "commander";
import {
  getConsoleUiRuntimeStatus,
  restartConsoleUiCommand,
  runConsoleUiRuntimeCommand,
  startConsoleUiCommand,
  stopConsoleUiCommand,
} from "./UI.js";
import { registerConfigCommand } from "./Config.js";
import { registerModelCommand } from "./Model.js";
import { consoleInitCommand } from "./ConsoleInit.js";
import { parseBoolean, parsePort, createVersionBanner } from "./IndexSupport.js";
import {
  consoleStatusCommand,
  printConsoleUiStatusPanel,
  printRunningConsoleAgents,
} from "./IndexConsoleStatus.js";
import {
  prepareForegroundAgent,
  ensureRegisteredAgentProjectRoot,
  resolveRunningConsoleAgents,
  restartConsoleCommand,
  runConsoleRuntimeCommand,
  startConsoleCommand,
  stopConsoleCommand,
} from "./IndexConsoleProcess.js";

/**
 * top-level console/CITY 命令注册参数。
 */
export interface ConsoleCommandRegistrationContext {
  /** 当前 CLI 版本号。 */
  version: string;
  /** 当前 CLI 入口文件绝对路径。 */
  cliPath: string;
}

/**
 * 注册 top-level CITY 生命周期命令与 `console` 命令组。
 */
export function registerConsoleCommands(
  program: Command,
  context: ConsoleCommandRegistrationContext,
): void {
  program
    .command("init")
    .description("初始化 console（模型/插件等全局配置，写入 ~/.downcity/downcity.db）")
    .option("--force [enabled]", "允许清空并重建 ~/.downcity/downcity.db 中的 console 数据（危险操作）", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (options: { force?: boolean }) => {
      await consoleInitCommand(options);
    }));

  program
    .command("start")
    .description("启动 CITY（等价于先执行 `city console start`，再执行 `city console ui start`）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await startConsoleCommand(context.cliPath);
      await startConsoleUiCommand({
        cliPath: context.cliPath,
      });
    }));

  program
    .command("stop")
    .description("停止 CITY（等价于执行 `city console stop`）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await stopConsoleCommand();
    }));

  program
    .command("restart")
    .description("重启 CITY（先重启 console 并恢复已运行 agent，再执行 `city console ui start`）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await restartConsoleCommand(context.cliPath);
      await startConsoleUiCommand({
        cliPath: context.cliPath,
      });
    }));

  const consoleCommand = program
    .command("console")
    .description("Console（中台）：统一管理多个 agent daemon")
    .helpOption("--help", "display help for command");

  consoleCommand
    .command("run")
    .description("internal console runtime")
    .action(runConsoleRuntimeCommand);

  consoleCommand
    .command("ui [action]")
    .description("管理 console UI（start/stop/restart/status，默认 start）")
    .option("-p, --port <port>", "UI 端口（默认 5315）", parsePort)
    .option("-h, --host <host>", "UI 主机（默认 127.0.0.1）")
    .helpOption("--help", "display help for command")
    .action(
      createVersionBanner(
        context.version,
        async (action: string | undefined, options?: { port?: number; host?: string }) => {
          const resolvedAction = String(action || "start").trim().toLowerCase();
          if (resolvedAction === "start") {
            await startConsoleUiCommand({
              options,
              cliPath: context.cliPath,
            });
            return;
          }
          if (resolvedAction === "run") {
            await runConsoleUiRuntimeCommand(options);
            return;
          }
          if (resolvedAction === "stop") {
            await stopConsoleUiCommand();
            return;
          }
          if (resolvedAction === "restart") {
            await restartConsoleUiCommand({
              options,
              cliPath: context.cliPath,
            });
            return;
          }
          if (resolvedAction === "status") {
            const status = await getConsoleUiRuntimeStatus();
            printConsoleUiStatusPanel(status);
            return;
          }
          console.error(
            `❌ Unknown action: ${resolvedAction}. Use start|stop|restart|status.`,
          );
          process.exit(1);
        },
      ),
    );

  consoleCommand
    .command("start")
    .description("启动 console（后台）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await startConsoleCommand(context.cliPath);
    }));

  consoleCommand
    .command("stop")
    .description("停止 console（先停子 agent，再停 console）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await stopConsoleCommand();
    }));

  consoleCommand
    .command("restart")
    .description("重启 console（先停子 agent，再重启并恢复原先运行中的 agent）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await restartConsoleCommand(context.cliPath);
    }));

  consoleCommand
    .command("status")
    .description("查看 console 与已托管 agent 运行状态")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      await consoleStatusCommand();
    }));

  consoleCommand
    .command("agents")
    .description("打印 console 当前托管的活跃 agent daemon 状态")
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (options?: { json?: boolean }) => {
      const views = await resolveRunningConsoleAgents();
      if (options?.json) {
        globalThis.console.log(
          JSON.stringify(
            {
              success: true,
              count: views.length,
              agents: views,
            },
            null,
            2,
          ),
        );
        return;
      }
      printRunningConsoleAgents(views);
    }));

  registerConfigCommand(consoleCommand);
  registerModelCommand(consoleCommand);
}

export {
  ensureRegisteredAgentProjectRoot,
  prepareForegroundAgent,
};
