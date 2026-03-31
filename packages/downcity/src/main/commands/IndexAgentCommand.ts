/**
 * CLI agent 命令装配。
 *
 * 关键点（中文）
 * - 统一承载 `city agent` 命令树，避免主入口继续混合 console 与 agent 两套语义。
 * - 只保留 agent 命令自身的校验与装配，不接管全局 CLI 初始化。
 */

import type { Command, Option } from "commander";
import { initCommand } from "./Init.js";
import { restartCommand } from "./Restart.js";
import { runCommand } from "./Run.js";
import { startCommand } from "./Start.js";
import { statusCommand } from "./Status.js";
import type { StartOptions } from "@/types/Start.js";
import { createVersionBanner, injectAgentContext, parseBoolean, parsePort } from "./IndexSupport.js";
import {
  cleanupStaleDaemonFiles,
  diagnoseDaemonStaleReasons,
  getDaemonLogPath,
  isProcessAlive as isDaemonProcessAlive,
  readDaemonPid,
} from "@/main/daemon/Manager.js";
import {
  ensureRegisteredAgentProjectRoot,
  prepareForegroundAgent,
} from "./IndexConsoleCommand.js";

/**
 * agent 命令注册参数。
 */
export interface AgentCommandRegistrationContext {
  /** 当前 CLI 版本号。 */
  version: string;
  /** commander 的隐藏 Option 构造器。 */
  hiddenPortOption: typeof Option;
}

/**
 * 注册 `city agent` 命令组。
 */
export function registerAgentCommands(
  program: Command,
  context: AgentCommandRegistrationContext,
): void {
  const agent = program
    .command("agent")
    .description("管理 Agent：创建/启停/重启")
    .helpOption("--help", "display help for command");

  agent
    .command("create [path]")
    .description("创建/初始化一个 Agent 项目")
    .option("-f, --force [enabled]", "允许覆盖已有 downcity.json（危险操作）", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (cwd: string = ".", options: { force?: boolean }) => {
      await initCommand(cwd, options);
    }));

  agent
    .command("start [path]")
    .description("启动 Agent 进程（后台/前台）")
    .addOption(new context.hiddenPortOption("--port <port>").argParser(parsePort).hideHelp())
    .option("-h, --host <host>", "服务主机（默认 0.0.0.0）")
    .option("--foreground [enabled]", "前台启动（仅当前终端）", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(
      createVersionBanner(
        context.version,
        async (cwd: string = ".", options: StartOptions & { foreground?: boolean }) => {
          const prepared = await prepareForegroundAgent(cwd, options);
          if (prepared.shouldForeground) {
            await runCommand(cwd, prepared.options);
            return;
          }
          await startCommand(cwd, prepared.options);
        },
      ),
    );

  agent
    .command("status [path]")
    .description("查看后台 Agent 进程（daemon）状态")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (cwd: string = ".") => {
      const projectRoot = await ensureRegisteredAgentProjectRoot(cwd);
      if (!projectRoot) process.exit(1);
      injectAgentContext(projectRoot);
      await statusCommand(projectRoot);
    }));

  agent
    .command("doctor [path]")
    .description("诊断 daemon 状态文件；可选修复僵尸 pid/meta")
    .option("--fix [enabled]", "清理僵尸 daemon 状态文件", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(
      context.version,
      async (cwd: string = ".", options: { fix?: boolean }) => {
        const projectRoot = await ensureRegisteredAgentProjectRoot(cwd);
        if (!projectRoot) process.exit(1);
        injectAgentContext(projectRoot);
        const pid = await readDaemonPid(projectRoot);

        if (!pid) {
          console.log("✅ No daemon pid file found");
          console.log(`   project: ${projectRoot}`);
          return;
        }

        if (isDaemonProcessAlive(pid)) {
          console.log("✅ Daemon process is alive");
          console.log(`   project: ${projectRoot}`);
          console.log(`   pid: ${pid}`);
          return;
        }

        console.log("⚠️  Stale daemon state detected");
        console.log(`   project: ${projectRoot}`);
        console.log(`   stalePid: ${pid}`);
        const staleReasons = await diagnoseDaemonStaleReasons(projectRoot, pid);
        console.log(`   reason: ${staleReasons.map((item) => item.message).join("; ")}`);
        console.log(`   log: ${getDaemonLogPath(projectRoot)}`);

        if (options.fix !== true) {
          console.log("   Run `city agent doctor <path> --fix` to clean stale pid/meta.");
          return;
        }

        await cleanupStaleDaemonFiles(projectRoot);
        console.log("✅ Cleaned stale daemon pid/meta files");
      },
    ));

  agent
    .command("restart [path]")
    .description("重启后台 Agent 进程（daemon）")
    .option("-h, --host <host>", "服务主机（默认 0.0.0.0）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (cwd: string = ".", options: StartOptions) => {
      const projectRoot = await ensureRegisteredAgentProjectRoot(cwd);
      if (!projectRoot) process.exit(1);
      injectAgentContext(projectRoot);
      await restartCommand(projectRoot, options);
    }));
}
