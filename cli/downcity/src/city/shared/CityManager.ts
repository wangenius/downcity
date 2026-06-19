/**
 * `city` 裸命令交互式首页。
 *
 * 关键点（中文）
 * - 裸 `city` 是本机 Agent 与 Plugin 操作台，不是 City 资源管理器。
 * - City 通过 Federation 成员资格访问共享资源；Federation 管理由 `city federation` 子命令负责。
 */

import {
  restartCityRuntimeCommand,
  stopCityRuntimeCommand,
} from "../runtime/gateway/runtime/GatewayProcess.js";
import { runInteractiveAgentManager } from "../agent/AgentManager.js";
import { runInteractivePluginManager } from "../command/PluginCommand.js";
import { run_interactive_federation_manager } from "./FederationConnection.js";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { t } from "../../shared/CliLocale.js";
import { promptAndPersistCityCliLocale } from "./InteractiveLocale.js";
import { open_city_dashboard } from "../tui/CityDashboard.js";
import type { tui_action_result } from "../types/Tui.js";

type CityHomeAction =
  | "stop"
  | "restart"
  | "federation"
  | "agent"
  | "plugin"
  | "language"
  | "help"
  | "exit";

interface CityHelpProgram {
  /** 输出当前 City 根命令帮助。 */
  outputHelp: () => void;
}

/**
 * 运行 `city` 裸命令交互式首页。
 */
export async function runInteractiveCityManager(params: {
  /**
   * City 根命令帮助输出器。
   */
  program: CityHelpProgram;

  /**
   * 当前 CLI 入口路径，用于启动或重启 City runtime。
   */
  cli_path: string;
}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    params.program.outputHelp();
    return;
  }

  await open_city_dashboard({
    run_action: async (action) => await run_city_dashboard_action(action, params),
  });

  emitCliBlock({
    tone: "info",
    title: t({
      zh: "City 管理器已关闭",
      en: "City manager closed",
    }),
  });
}

/**
 * 执行 City 顶层 TUI 动作。
 */
async function run_city_dashboard_action(
  action: CityHomeAction,
  params: {
    program: CityHelpProgram;
    cli_path: string;
  },
): Promise<tui_action_result> {
  if (action === "exit") {
    return "quit";
  }

  try {
    if (action === "stop") {
      await stopCityRuntimeCommand();
      return "refresh";
    }
    if (action === "restart") {
      await restartCityRuntimeCommand(params.cli_path);
      return "refresh";
    }
    if (action === "federation") {
      await run_interactive_federation_manager();
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
      await promptAndPersistCityCliLocale();
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
        zh: "City 管理器操作失败",
        en: "City manager action failed",
      }),
      note: error instanceof Error ? error.message : String(error),
    });
  }

  return "refresh";
}
