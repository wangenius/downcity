/**
 * `city` 裸命令交互式首页。
 *
 * 关键点（中文）
 * - 裸 `city` 是本机 Agent 与 Plugin 操作台，不是 City 资源管理器。
 * - City 只作为连接上下文进入 City；模型和服务资源仍回到 `city` CLI 管理。
 */
import { restartCityRuntimeCommand, stopCityRuntimeCommand, } from "../runtime/gateway/runtime/GatewayProcess.js";
import { runInteractiveAgentManager } from "../agent/AgentManager.js";
import { runInteractivePluginManager } from "../command/PluginCommand.js";
import { runInteractiveCityManager as runInteractiveCityConnectionManager } from "./CityConnection.js";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { t } from "./CliLocale.js";
import { promptAndPersistCityCliLocale } from "./InteractiveLocale.js";
import { open_city_dashboard } from "../tui/CityDashboard.js";
/**
 * 运行 `city` 裸命令交互式首页。
 */
export async function runInteractiveCityManager(params) {
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
async function run_city_dashboard_action(action, params) {
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
        if (action === "city") {
            await runInteractiveCityConnectionManager();
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
    }
    catch (error) {
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
//# sourceMappingURL=CityManager.js.map