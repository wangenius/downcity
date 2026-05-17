/**
 * CLI agent 命令装配。
 *
 * 关键点（中文）
 * - 统一承载 `city agent` 命令树，避免主入口继续混合 console 与 agent 两套语义。
 * - 只保留 agent 命令自身的校验与装配，不接管全局 CLI 初始化。
 */

import type { Command, Option } from "commander";
import {
  emitRegisteredAgentListWithOptions,
  resolveCliAgentStartProjectRoot,
} from "../agent/AgentSelection.js";
import { runInteractiveAgentManager } from "../agent/AgentManager.js";
import { chatCommand } from "../agent/AgentChat.js";
import { agentHistoryCleanCommand } from "../agent/AgentHistory.js";
import { initCommand } from "../agent/Init.js";
import { restartCommand } from "../agent/Restart.js";
import { stopCommand } from "../agent/Stop.js";
import { agentResetCommand } from "../agent/AgentReset.js";
import { runCommand } from "../agent/Run.js";
import { startCommand } from "../agent/Start.js";
import { statusCommand } from "../agent/Status.js";
import type { StartOptions } from "@downcity/agent";
import { createVersionBanner, injectAgentContext, parseBoolean, parsePort } from "./IndexSupport.js";
import { runWithSpinner } from "@/utils/cli/Spinner.js";
import { emitCliBlock } from "./CliReporter.js";
import {
  cleanupStaleDaemonFiles,
  diagnoseDaemonStaleReasons,
  isProcessAlive as isDaemonProcessAlive,
  readDaemonPid,
} from "@/process/daemon/Manager.js";
import {
  ensureRegisteredAgentProjectRoot,
  prepareForegroundAgent,
} from "../control-plane/ControlPlaneCommand.js";

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
    .description("管理 Agent：创建/列出/启停/重启（无参数时启动交互式管理器）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async () => {
      if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
        await runInteractiveAgentManager();
        return;
      }
      agent.outputHelp();
    }));

  agent
    .command("create [path]")
    .description("创建/初始化一个 Agent 项目")
    .option("-f, --force [enabled]", "允许覆盖已有 downcity.json（危险操作）", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (cwd: string = ".", options: { force?: boolean }) => {
      await initCommand(cwd, options);
    }));

  agent
    .command("list")
    .description("列出已登记到 city 的 Agent 项目")
    .option("--running [enabled]", "仅列出当前运行中的 Agent", parseBoolean)
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(
      context.version,
      async (options: { running?: boolean; json?: boolean }) => {
        await emitRegisteredAgentListWithOptions({
          runningOnly: options.running === true,
          asJson: options.json === true,
        });
      },
    ));

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
        async (cwd: string | undefined, options: StartOptions & { foreground?: boolean }) => {
          const projectRoot = await resolveCliAgentStartProjectRoot(cwd);

          const prepared = await prepareForegroundAgent(projectRoot, options);
          if (prepared.shouldForeground) {
            await runCommand(prepared.projectRoot, prepared.options);
            return;
          }
          await startCommand(prepared.projectRoot, prepared.options);
        },
      ),
    );

  agent
    .command("chat")
    .description("在终端中与指定 Agent 对话（交互式或一次性）")
    .option("-t, --to <name>", "目标 agent 名称（省略时交互选择）")
    .option("-m, --message <text>", "一次性发送一轮消息并退出")
    .option("--json [enabled]", "一次性模式下以 JSON 输出", parseBoolean)
    .option("--host <host>", "Server host（覆盖自动解析）")
    .addOption(new context.hiddenPortOption("--port <port>").argParser(parsePort).hideHelp())
    .option("--token <token>", "覆盖 Bearer Token（仅远程 HTTP 调用需要）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(
      context.version,
      async (
        options: {
          to?: string;
          message?: string;
          json?: boolean;
          host?: string;
          port?: number;
          token?: string;
        },
      ) => {
        await chatCommand(options);
      },
    ));

  const history = agent
    .command("history")
    .description("维护 Agent 会话历史");

  history
    .command("clean [path]")
    .description("按 session 或 chat 目标硬清理一条会话历史")
    .option("--session-id <sessionId>", "目标 session ID")
    .option("--channel <channel>", "目标聊天渠道，例如 telegram")
    .option("--chat-id <chatId>", "目标渠道 chat ID")
    .option("--target-type <targetType>", "目标渠道会话类型")
    .option("--thread-id <threadId>", "目标线程 ID")
    .option("--hard [enabled]", "执行硬清理：删除 session/chat/route", parseBoolean)
    .option("--json [enabled]", "以 JSON 输出", parseBoolean)
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(
      context.version,
      async (
        cwd: string = ".",
        options: {
          sessionId?: string;
          channel?: string;
          chatId?: string;
          targetType?: string;
          threadId?: string;
          hard?: boolean;
          json?: boolean;
        },
      ) => {
        const projectRoot = await ensureRegisteredAgentProjectRoot(cwd);
        await agentHistoryCleanCommand(projectRoot, options);
      },
    ));

  agent
    .command("status [path]")
    .description("查看后台 Agent 进程（daemon）状态")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (cwd: string = ".") => {
      const projectRoot = await ensureRegisteredAgentProjectRoot(cwd);
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
        injectAgentContext(projectRoot);
        const pid = await readDaemonPid(projectRoot);

        if (!pid) {
          emitCliBlock({
            tone: "success",
            title: "No daemon state found",
            facts: [
              {
                label: "Project",
                value: projectRoot,
              },
            ],
          });
          return;
        }

        if (isDaemonProcessAlive(pid)) {
          emitCliBlock({
            tone: "success",
            title: "Daemon process is alive",
            facts: [
              {
                label: "Project",
                value: projectRoot,
              },
            ],
          });
          return;
        }

        const staleReasons = await diagnoseDaemonStaleReasons(projectRoot, pid);
        emitCliBlock({
          tone: "warning",
          title: "Stale daemon state detected",
          facts: [
            {
              label: "Project",
              value: projectRoot,
            },
            {
              label: "Reason",
              value: staleReasons.map((item) => item.message).join("; "),
            },
          ],
        });

        if (options.fix !== true) {
          emitCliBlock({
            tone: "info",
            title: "Suggested fix",
            facts: [
              {
                label: "Command",
                value: "city agent doctor <path> --fix",
              },
            ],
          });
          return;
        }

        await runWithSpinner(
          () => cleanupStaleDaemonFiles(projectRoot),
          { text: "Cleaning stale daemon files..." },
        );
        emitCliBlock({
          tone: "success",
          title: "Cleaned stale daemon state",
          facts: [
            {
              label: "Project",
              value: projectRoot,
            },
          ],
        });
      },
    ));

  agent
    .command("reset [path]")
    .description("重新配置 Agent 的执行模型绑定")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (cwd: string = ".") => {
      // reset 不要求 agent 在 registry 中，只需要 downcity.json 存在
      await agentResetCommand(cwd);
    }));

  agent
    .command("stop [path]")
    .description("停止后台 Agent 进程（daemon）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (cwd: string = ".") => {
      const projectRoot = await ensureRegisteredAgentProjectRoot(cwd);
      injectAgentContext(projectRoot);
      await stopCommand(projectRoot);
    }));

  agent
    .command("restart [path]")
    .description("重启后台 Agent 进程（daemon）")
    .option("-h, --host <host>", "服务主机（默认 0.0.0.0）")
    .helpOption("--help", "display help for command")
    .action(createVersionBanner(context.version, async (cwd: string = ".", options: StartOptions) => {
      const projectRoot = await ensureRegisteredAgentProjectRoot(cwd);
      injectAgentContext(projectRoot);
      await restartCommand(projectRoot, options);
    }));
}
