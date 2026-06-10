/**
 * `town` 裸命令交互式首页。
 *
 * 关键点（中文）
 * - 裸 `town` 是本机 Agent 与 Plugin 操作台，不是 City 资源管理器。
 * - City 只作为连接上下文进入 Town；模型和服务资源仍回到 `city` CLI 管理。
 */

import {
  restartTownRuntimeCommand,
  stopTownRuntimeCommand,
} from "../town/gateway/runtime/GatewayProcess.js";
import { runInteractiveAgentManager } from "../agent/AgentManager.js";
import { runInteractivePluginManager } from "../command/PluginCommand.js";
import { runInteractiveCityManager } from "./CityConnection.js";
import { emitCliBlock } from "./CliReporter.js";
import { t } from "./CliLocale.js";
import { promptAndPersistTownCliLocale } from "./InteractiveLocale.js";
import { open_town_dashboard } from "../tui/TownDashboard.js";
import type { tui_action_result } from "../types/Tui.js";

type TownHomeAction =
  | "stop"
  | "restart"
  | "city"
  | "agent"
  | "plugin"
  | "language"
  | "help"
  | "exit";

interface TownHelpProgram {
  /** 输出当前 Town 根命令帮助。 */
  outputHelp: () => void;
}

/**
 * 运行 `town` 裸命令交互式首页。
 */
export async function runInteractiveTownManager(params: {
  /**
   * Town 根命令帮助输出器。
   */
  program: TownHelpProgram;

  /**
   * 当前 CLI 入口路径，用于启动或重启 Town runtime。
   */
  cli_path: string;
}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    params.program.outputHelp();
    return;
  }

  await open_town_dashboard({
    run_action: async (action) => await run_town_dashboard_action(action, params),
  });

  emitCliBlock({
    tone: "info",
    title: t({
      zh: "Town 管理器已关闭",
      en: "Town manager closed",
    }),
  });
}

/**
 * 执行 Town 顶层 TUI 动作。
 */
async function run_town_dashboard_action(
  action: TownHomeAction,
  params: {
    program: TownHelpProgram;
    cli_path: string;
  },
): Promise<tui_action_result> {
  if (action === "exit") {
    return "quit";
  }

  try {
    if (action === "stop") {
      await stopTownRuntimeCommand();
      return "refresh";
    }
    if (action === "restart") {
      await restartTownRuntimeCommand(params.cli_path);
      return "refresh";
    }
    if (action === "city") {
      await runInteractiveCityManager();
      return "refresh";
    }
    if (action === "agent") {
      await runInteractiveAgentManager();
      return "refresh";
    }
    if (action === "plugin") {
      await runInteractivePluginManager();
      return "refresh";
    }
    if (action === "language") {
      await promptAndPersistTownCliLocale();
      return "refresh";
    }
    if (action === "help") {
      params.program.outputHelp();
      return "refresh";
    }
  } catch (error) {
    emitCliBlock({
      tone: "error",
      title: t({
        zh: "Town 管理器操作失败",
        en: "Town manager action failed",
      }),
      note: error instanceof Error ? error.message : String(error),
    });
  }

  return "refresh";
}
