/**
 * `town` 裸命令交互式首页。
 *
 * 关键点（中文）
 * - 裸 `town` 是本机 Agent 与 Plugin 操作台，不是 City 资源管理器。
 * - City 只作为连接上下文进入 Town；模型和服务资源仍回到 `city` CLI 管理。
 */
import prompts from "prompts";
import { gatewayStatusCommand } from "../town/gateway/runtime/GatewayStatus.js";
import { startGatewayRuntimeCommand } from "../town/gateway/runtime/GatewayRuntime.js";
import { runInteractiveAgentManager } from "../agent/AgentManager.js";
import { runInteractivePluginManager } from "../command/PluginCommand.js";
import { runInteractiveChatManager } from "./ChatManager.js";
import { runInteractiveCityManager } from "./CityConnection.js";
import { emitCliBlock } from "./CliReporter.js";
async function promptTownHomeAction() {
    const response = (await prompts({
        type: "select",
        name: "action",
        message: "Town 操作台",
        choices: [
            {
                title: "查看总览",
                description: "Town runtime、Console、受管 Agent 状态",
                value: "status",
            },
            {
                title: "连接 City",
                description: "导入或手动设置 Town 到 City 的连接上下文",
                value: "city",
            },
            {
                title: "管理 Agent",
                description: "创建、列出、启停、重启、聊天",
                value: "agent",
            },
            {
                title: "管理 Agent Plugins",
                description: "查看目录，按 Agent 管理 plugin 状态",
                value: "plugin",
            },
            {
                title: "Chat plugin 快捷入口",
                description: "配置 channel account 与 chat plugin 生命周期",
                value: "chat",
            },
            {
                title: "打开 Console",
                description: "启动本机控制台",
                value: "console",
            },
            {
                title: "查看帮助",
                description: "输出 town 命令帮助",
                value: "help",
            },
            {
                title: "退出",
                description: "关闭 Town 操作台",
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
                title: "Town manager closed",
            });
            return;
        }
        try {
            if (action === "status") {
                await gatewayStatusCommand();
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
            if (action === "chat") {
                await runInteractiveChatManager();
                continue;
            }
            if (action === "console") {
                await startGatewayRuntimeCommand({
                    cliPath: params.cli_path,
                });
                continue;
            }
            if (action === "help") {
                params.program.outputHelp();
            }
        }
        catch (error) {
            emitCliBlock({
                tone: "error",
                title: "Town manager action failed",
                note: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
//# sourceMappingURL=TownManager.js.map