/**
 * `town` 裸命令交互式首页。
 *
 * 关键点（中文）
 * - 裸 `town` 是本机 Agent 与 Plugin 操作台，不是 City 资源管理器。
 * - City 只作为连接上下文进入 Town；模型和服务资源仍回到 `city` CLI 管理。
 */
import prompts from "prompts";
import { gatewayStatusCommand } from "../town/gateway/runtime/GatewayStatus.js";
import { restartTownRuntimeCommand, startTownRuntimeCommand, stopTownRuntimeCommand, } from "../town/gateway/runtime/GatewayProcess.js";
import { runInteractiveAgentManager } from "../agent/AgentManager.js";
import { runInteractivePluginManager } from "../command/PluginCommand.js";
import { runInteractiveCityManager } from "./CityConnection.js";
import { emitCliBlock } from "./CliReporter.js";
import { getCliLocale, t } from "./CliLocale.js";
import { promptAndPersistTownCliLocale } from "./InteractiveLocale.js";
async function promptTownHomeAction() {
    const current_locale = getCliLocale();
    const response = (await prompts({
        type: "select",
        name: "action",
        message: t({
            zh: "Town 操作台",
            en: "Town dashboard",
        }),
        choices: [
            {
                title: t({
                    zh: "查看总览",
                    en: "View overview",
                }),
                description: t({
                    zh: "查看 Town runtime、受管 Agent 与 City 连接状态",
                    en: "Inspect Town runtime, managed agents, and City connection status",
                }),
                value: "status",
            },
            {
                title: t({
                    zh: "启动 Town",
                    en: "Start Town",
                }),
                description: t({
                    zh: "启动 Town runtime",
                    en: "Start the Town runtime",
                }),
                value: "start",
            },
            {
                title: t({
                    zh: "停止 Town",
                    en: "Stop Town",
                }),
                description: t({
                    zh: "停止 Town runtime 与受管 Agent",
                    en: "Stop the Town runtime and managed agents",
                }),
                value: "stop",
            },
            {
                title: t({
                    zh: "重启 Town",
                    en: "Restart Town",
                }),
                description: t({
                    zh: "重启 runtime，并恢复此前运行中的受管 Agent",
                    en: "Restart the runtime and recover previously running managed agents",
                }),
                value: "restart",
            },
            {
                title: t({
                    zh: "连接 City",
                    en: "Connect City",
                }),
                description: t({
                    zh: "导入或手动设置 Town 到 City 的连接上下文",
                    en: "Import or manually configure the Town-to-City connection context",
                }),
                value: "city",
            },
            {
                title: t({
                    zh: "管理 Agent",
                    en: "Manage agents",
                }),
                description: t({
                    zh: "创建、列出、启停、重启、聊天",
                    en: "Create, list, start, stop, restart, and chat with agents",
                }),
                value: "agent",
            },
            {
                title: t({
                    zh: "配置 Plugins",
                    en: "Configure plugins",
                }),
                description: t({
                    zh: "配置 Agent 可用 plugin 能力与运行边界",
                    en: "Configure plugin capabilities and runtime boundaries for agents",
                }),
                value: "plugin",
            },
            {
                title: t({
                    zh: "切换语言",
                    en: "Language",
                }),
                description: current_locale === "zh"
                    ? t({
                        zh: "当前默认语言：中文",
                        en: "Current default language: Chinese",
                    })
                    : t({
                        zh: "当前默认语言：英文",
                        en: "Current default language: English",
                    }),
                value: "language",
            },
            {
                title: t({
                    zh: "查看帮助",
                    en: "Show help",
                }),
                description: t({
                    zh: "输出 town 命令帮助",
                    en: "Print town command help",
                }),
                value: "help",
            },
            {
                title: t({
                    zh: "退出",
                    en: "Exit",
                }),
                description: t({
                    zh: "关闭 Town 操作台",
                    en: "Close the Town dashboard",
                }),
                value: "exit",
            },
        ],
        initial: 0,
    }));
    return response.action || null;
}
/**
 * 运行 `town` 裸命令交互式首页。
 */
export async function runInteractiveTownManager(params) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        params.program.outputHelp();
        return;
    }
    while (true) {
        const action = await promptTownHomeAction();
        if (!action || action === "exit") {
            emitCliBlock({
                tone: "info",
                title: t({
                    zh: "Town 管理器已关闭",
                    en: "Town manager closed",
                }),
            });
            return;
        }
        try {
            if (action === "status") {
                await gatewayStatusCommand();
                continue;
            }
            if (action === "start") {
                await startTownRuntimeCommand(params.cli_path);
                continue;
            }
            if (action === "stop") {
                await stopTownRuntimeCommand();
                continue;
            }
            if (action === "restart") {
                await restartTownRuntimeCommand(params.cli_path);
                continue;
            }
            if (action === "city") {
                await runInteractiveCityManager();
                continue;
            }
            if (action === "agent") {
                await runInteractiveAgentManager();
                continue;
            }
            if (action === "plugin") {
                await runInteractivePluginManager();
                continue;
            }
            if (action === "language") {
                await promptAndPersistTownCliLocale();
                continue;
            }
            if (action === "help") {
                params.program.outputHelp();
            }
        }
        catch (error) {
            emitCliBlock({
                tone: "error",
                title: t({
                    zh: "Town 管理器操作失败",
                    en: "Town manager action failed",
                }),
                note: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
//# sourceMappingURL=TownManager.js.map