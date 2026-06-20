/**
 * `city plugin` 命令树入口。
import { runLocalPluginAction } from "@downcity/agent";
 *
 * 关键点（中文）
 * - 负责注册所有 plugin 相关子命令。
 * - 交互式入口委托给 helpers 中的 prompts 与 actions。
 */
import { runLocalPluginAction } from "@downcity/agent";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { helpText, t } from "../../shared/CliLocale.js";
import { parseBoolean, parsePort } from "../../shared/IndexSupport.js";
import { printResult } from "../../city/utils/cli/CliOutput.js";
import { registerPluginScheduleCommands } from "../../city/command/PluginScheduleCommand.js";
import { runManagedPluginCommandBridge } from "../../city/shared/ManagedPluginRemote.js";
import { runInteractiveChatManager } from "../../city/shared/ChatManager.js";
import { createPluginCatalog, parseCommandPayload, promptPluginSelection, resolvePluginProjectRoot, runPluginInfoCommand, runPluginListCommand, validatePluginProjectRoot, } from "./plugin/PluginHelpers.js";
export async function runInteractivePluginManager() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return;
    }
    while (true) {
        const selection = await promptPluginSelection();
        if (!selection || selection.type === "exit") {
            emitCliBlock({
                tone: "info",
                title: "Plugin manager closed",
            });
            return;
        }
        try {
            if (selection.type === "chat") {
                await runInteractiveChatManager();
                continue;
            }
            if (selection.type === "plugin") {
                await runPluginInfoCommand({
                    pluginName: selection.plugin_name,
                    options: {
                        json: false,
                    },
                });
            }
        }
        catch (error) {
            emitCliBlock({
                tone: "error",
                title: "Plugin manager action failed",
                note: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
async function runPluginActionCommand(params) {
    const resolved = await resolvePluginProjectRoot(params.options);
    if (!resolved.projectRoot) {
        printResult({
            asJson: params.options.json,
            success: false,
            title: "plugin action failed",
            payload: {
                error: resolved.error || "Failed to resolve agent project path",
            },
        });
        return;
    }
    const pluginPathError = validatePluginProjectRoot(resolved.projectRoot);
    if (pluginPathError) {
        printResult({
            asJson: params.options.json,
            success: false,
            title: "plugin action failed",
            payload: {
                error: pluginPathError || `Invalid plugin project path: ${resolved.projectRoot}. Missing: downcity.json`,
            },
        });
        return;
    }
    const payload = parseCommandPayload(params.payload);
    const local = await runLocalPluginAction({
        plugins: createPluginCatalog(),
        projectRoot: resolved.projectRoot,
        pluginName: params.pluginName,
        actionName: params.actionName,
        ...(payload !== undefined ? { payload } : {}),
    });
    printResult({
        asJson: params.options.json,
        success: Boolean(local.success),
        title: local.success ? "plugin action ok" : "plugin action failed",
        payload: {
            pluginName: params.pluginName,
            actionName: params.actionName,
            ...(local.data !== undefined ? { data: local.data } : {}),
            ...(local.message ? { message: local.message } : {}),
            ...(local.error ? { error: local.error } : {}),
        },
    });
}
/**
 * 注册 `city plugin` 命令组。
 */
export function registerPluginsCommand(program) {
    const plugin = program
        .command("plugin")
        .description(t({
        zh: "管理 plugin（无参数时启动交互式管理器）",
        en: "manage plugins (opens the interactive manager when used without arguments)",
    }))
        .helpOption("--help", helpText());
    plugin.action(async () => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            plugin.outputHelp();
            return;
        }
        await runInteractivePluginManager();
    });
    plugin
        .command("list")
        .description(t({
        zh: "列出全部已注册 plugin 的静态信息",
        en: "list static metadata for all registered plugins",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .helpOption("--help", helpText())
        .action(async (opts) => {
        await runPluginListCommand(opts);
    });
    plugin
        .command("info [pluginName]")
        .description(t({
        zh: "查看单个 plugin 的静态信息",
        en: "show static metadata for a single plugin",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean)
        .helpOption("--help", helpText())
        .action(async (pluginName, opts) => {
        await runPluginInfoCommand({
            pluginName,
            options: opts,
        });
    });
    plugin
        .command("command <pluginName> <command>")
        .description(t({
        zh: "按 agent 目标转发托管 plugin command",
        en: "forward a managed plugin command to an agent target",
    }))
        .option("--payload <json>", t({
        zh: "可选 payload（JSON 字符串或普通字符串）",
        en: "optional payload as JSON or plain string",
    }))
        .option("--path <path>", t({
        zh: "项目根目录（默认当前目录）",
        en: "project root path (default: current directory)",
    }), ".")
        .option("--agent <id>", t({
        zh: "agent id（从 managed agent registry 解析）",
        en: "agent id resolved from the managed agent registry",
    }))
        .option("--host <host>", t({
        zh: "Server host（覆盖自动解析）",
        en: "Server host override",
    }))
        .option("--port <port>", t({
        zh: "Server port（覆盖自动解析）",
        en: "Server port override",
    }), parsePort)
        .option("--token <token>", t({
        zh: "覆盖 Bearer Token（按 City Agent HTTP gateway 调用时可选）",
        en: "override the Bearer Token for City Agent HTTP gateway calls",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean, true)
        .helpOption("--help", helpText())
        .action(async (pluginName, command, opts) => {
        await runManagedPluginCommandBridge({
            pluginName,
            command,
            payloadRaw: opts.payload,
            options: opts,
        });
    });
    plugin
        .command("action <pluginName> <actionName>")
        .description(t({
        zh: "运行 plugin action（在当前本地项目内直接执行）",
        en: "run a plugin action directly in the current local project",
    }))
        .option("--payload <json>", t({
        zh: "Action payload（JSON 或普通字符串）",
        en: "action payload as JSON or plain string",
    }))
        .option("--path <path>", t({
        zh: "agent 项目路径（默认当前目录）",
        en: "agent project path (default: current directory)",
    }), ".")
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean, true)
        .helpOption("--help", helpText())
        .action(async (pluginName, actionName, opts) => {
        await runPluginActionCommand({
            pluginName,
            actionName,
            payload: opts.payload,
            options: opts,
        });
    });
    registerPluginScheduleCommands(plugin);
}
//# sourceMappingURL=PluginCommand.js.map