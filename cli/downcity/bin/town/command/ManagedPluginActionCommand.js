/**
 * 受 agent 托管的 plugin action CLI 注册器。
 *
 * 关键点（中文）
 * - 负责把需要运行中 agent 承载的 plugin actions 挂到 commander（`town <plugin> <action>`）。
 * - 仅处理 CLI 参数映射与远程调用，不承载 plugin 状态机逻辑。
 * - 命令注册表与调度时间解析统一复用 agent 包实现，避免 Town 维护第二套事实源。
 */
import path from "node:path";
import { parseActionScheduleRunAtMsOrThrow, } from "@downcity/agent";
import { listPluginsWithLifecycle } from "@downcity/agent";
import { callServer } from "../process/daemon/Client.js";
import { printResult } from "../utils/cli/CliOutput.js";
import { parseBoolean, parsePort } from "../../shared/IndexSupport.js";
import { getCliLocale, helpText, t } from "../../shared/CliLocale.js";
function buildChatPluginHelpText() {
    if (getCliLocale() === "zh") {
        return [
            "",
            "Chat quick guide:",
            "  直接输出 assistant 文本会发送到当前 chat platform。",
            "  跨 chat 发送请使用 `town chat send --chat-key <chatKey>`。",
            "  如果要发正文/附件/定时消息，先看 `town chat send --help` 与 `town chat react --help`。",
            "",
            "Common examples:",
            "  town chat send --text 'done'",
            "  town chat send --chat-key <chatKey> --text 'done'",
            "  town chat react --message-id <messageId> --emoji '✅'",
            "  town chat context",
            "  town chat history --limit 30",
        ].join("\n");
    }
    return [
        "",
        "Chat quick guide:",
        "  Plain assistant text is sent to the current chat platform automatically.",
        "  To send across chats, use `town chat send --chat-key <chatKey>`.",
        "  For rich text, attachments, or scheduled messages, check `town chat send --help` and `town chat react --help` first.",
        "",
        "Common examples:",
        "  town chat send --text 'done'",
        "  town chat send --chat-key <chatKey> --text 'done'",
        "  town chat react --message-id <messageId> --emoji '✅'",
        "  town chat context",
        "  town chat history --limit 30",
    ].join("\n");
}
const CHAT_HELP_HOOK_ATTACHED = Symbol("chat-help-hook-attached");
const CHAT_RUNTIME_ACTION_COMMANDS_HIDDEN_FROM_TOWN = new Set([
    "status",
    "test",
    "reconnect",
    "open",
    "close",
    "configuration",
    "configure",
]);
function translateManagedPluginDescription(pluginName, actionName, description) {
    if (getCliLocale() === "zh") {
        return description;
    }
    if (pluginName === "chat") {
        const chatMap = {
            list: "list recorded chat sessions for the current agent (chatTitle/chatKey)",
            info: "show details for a selected chat session (route/local path/context snapshot)",
            send: "send a message to a target chatKey",
            react: "add a reaction to a target message (Telegram only for now)",
            context: "show the current conversation context snapshot",
            delete: "permanently delete a selected chat session (mapping + history + context)",
            history: "read chat history messages (latest 30 by default)",
        };
        return chatMap[actionName] ?? description;
    }
    return description;
}
function resolveProjectRoot(pathInput) {
    return path.resolve(String(pathInput || "."));
}
function toJsonValue(input) {
    if (input === null)
        return null;
    if (typeof input === "string")
        return input;
    if (typeof input === "number") {
        return Number.isFinite(input) ? input : undefined;
    }
    if (typeof input === "boolean")
        return input;
    if (Array.isArray(input)) {
        const values = [];
        for (const item of input) {
            const value = toJsonValue(item);
            if (value === undefined)
                continue;
            values.push(value);
        }
        return values;
    }
    if (typeof input === "object" && input) {
        const output = {};
        for (const [key, value] of Object.entries(input)) {
            const normalized = toJsonValue(value);
            if (normalized === undefined)
                continue;
            output[key] = normalized;
        }
        return output;
    }
    return undefined;
}
function toPluginActionCommandOpts(options) {
    const reservedKeys = new Set(["path", "host", "port", "token", "json", "delay", "time"]);
    const normalized = {};
    for (const [key, value] of Object.entries(options)) {
        if (reservedKeys.has(key))
            continue;
        const nextValue = toJsonValue(value);
        if (nextValue === undefined)
            continue;
        normalized[key] = nextValue;
    }
    return normalized;
}
function toPluginCliBridgeOptions(options) {
    return {
        path: typeof options.path === "string" ? options.path : ".",
        host: typeof options.host === "string" ? options.host : undefined,
        port: typeof options.port === "number" ? options.port : undefined,
        token: typeof options.token === "string" ? options.token : undefined,
        json: options.json !== false,
    };
}
function flattenPluginActionCommandArgs(values) {
    const out = [];
    const pushValue = (value) => {
        if (value === undefined || value === null)
            return;
        if (Array.isArray(value)) {
            for (const item of value)
                pushValue(item);
            return;
        }
        const text = String(value).trim();
        if (!text)
            return;
        out.push(text);
    };
    for (const value of values) {
        pushValue(value);
    }
    return out;
}
function isCommanderCommandLike(value) {
    return Boolean(value &&
        typeof value === "object" &&
        typeof value.opts === "function");
}
function isPlainOptionsObject(value) {
    return Boolean(value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof value.opts !== "function");
}
/**
 * 判断 command 是否已定义指定长参数。
 */
function hasLongOption(command, longFlag) {
    return command.options.some((item) => item.long === longFlag);
}
/**
 * 从 CLI 选项中提取通用调度输入。
 */
function extractCommandScheduleInput(options) {
    const runAtMs = parseActionScheduleRunAtMsOrThrow({
        delay: options.delay,
        time: options.time,
    });
    if (typeof runAtMs !== "number")
        return undefined;
    return { runAtMs };
}
function registerPluginActionCommand(params) {
    // 关键点（中文）：chat platform 运行态与配置由 agent 内部管理，Town 不注册这些快捷命令。
    if (params.plugin.name === "chat" &&
        CHAT_RUNTIME_ACTION_COMMANDS_HIDDEN_FROM_TOWN.has(params.actionName)) {
        return;
    }
    const commandSpec = params.action.command;
    if (!commandSpec)
        return;
    const pluginCommand = params.program.commands.find((item) => item.name() === params.plugin.name) ||
        params.program
            .command(params.plugin.name)
            .description(t({
            zh: `${params.plugin.name} plugin actions`,
            en: `${params.plugin.name} plugin actions`,
        }))
            .helpOption("--help", helpText());
    if (params.plugin.name === "chat" &&
        !pluginCommand[CHAT_HELP_HOOK_ATTACHED]) {
        const chatCommand = pluginCommand;
        chatCommand.on("--help", () => {
            console.log(buildChatPluginHelpText());
        });
        chatCommand[CHAT_HELP_HOOK_ATTACHED] = true;
    }
    const actionCommand = pluginCommand
        .command(params.actionName)
        .description(translateManagedPluginDescription(params.plugin.name, params.actionName, commandSpec.description))
        .helpOption("--help", helpText())
        .option("--path <path>", t({
        zh: "项目根目录（默认当前目录）",
        en: "project root path (default: current directory)",
    }), ".")
        .option("--host <host>", t({
        zh: "Server host（覆盖自动解析）",
        en: "Server host override",
    }))
        .option("--port <port>", t({
        zh: "Server port（覆盖自动解析）",
        en: "Server port override",
    }), parsePort)
        .option("--token <token>", t({
        zh: "覆盖 Bearer Token（按 Town Agent HTTP gateway 调用时可选）",
        en: "override the Bearer Token for Town Agent HTTP gateway calls",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean, true);
    commandSpec.configure?.(actionCommand);
    if (!hasLongOption(actionCommand, "--delay")) {
        actionCommand.option("--delay <ms>", t({
            zh: "延迟执行毫秒数（所有 plugin action 通用）",
            en: "delay execution in milliseconds (shared by all plugin actions)",
        }));
    }
    if (!hasLongOption(actionCommand, "--time")) {
        actionCommand.option("--time <time>", t({
            zh: "定时执行时间（Unix 时间戳秒/毫秒或 ISO 时间，所有 plugin action 通用）",
            en: "schedule execution time as Unix seconds/milliseconds or ISO time (shared by all plugin actions)",
        }));
    }
    actionCommand.action(async (...rawArgs) => {
        const last = rawArgs.at(-1);
        const commandLike = isCommanderCommandLike(last) ? last : null;
        const positionalArgs = commandLike
            ? flattenPluginActionCommandArgs(Array.isArray(commandLike.processedArgs)
                ? commandLike.processedArgs
                : [])
            : (() => {
                const fallbackLast = rawArgs.at(-1);
                const fallbackPositional = isPlainOptionsObject(fallbackLast)
                    ? rawArgs.slice(0, -1)
                    : rawArgs;
                return flattenPluginActionCommandArgs(fallbackPositional);
            })();
        const allOptions = commandLike
            ? (commandLike.opts() || {})
            : (() => {
                const fallbackLast = rawArgs.at(-1);
                return isPlainOptionsObject(fallbackLast) ? fallbackLast : {};
            })();
        const actionOptions = toPluginActionCommandOpts(allOptions);
        const bridgeOptions = toPluginCliBridgeOptions(allOptions);
        let schedule;
        try {
            schedule = extractCommandScheduleInput(allOptions);
        }
        catch (error) {
            printResult({
                asJson: bridgeOptions.json,
                success: false,
                title: `${params.plugin.name}.${params.actionName} failed`,
                payload: {
                    error: `Failed to parse schedule input: ${String(error)}`,
                },
            });
            return;
        }
        let payload;
        try {
            payload = await commandSpec.mapInput({
                args: positionalArgs,
                opts: actionOptions,
            });
        }
        catch (error) {
            printResult({
                asJson: bridgeOptions.json,
                success: false,
                title: `${params.plugin.name}.${params.actionName} failed`,
                payload: {
                    error: `Failed to parse command input: ${String(error)}`,
                },
            });
            return;
        }
        const remote = await callServer({
            projectRoot: resolveProjectRoot(bridgeOptions.path),
            path: "/api/plugins/command",
            method: "POST",
            host: bridgeOptions.host,
            port: bridgeOptions.port,
            authToken: bridgeOptions.token,
            body: {
                pluginName: params.plugin.name,
                command: params.actionName,
                payload,
                ...(schedule ? { schedule } : {}),
            },
        });
        if (remote.success && remote.data) {
            const data = remote.data;
            printResult({
                asJson: bridgeOptions.json,
                success: Boolean(data.success),
                title: data.success
                    ? `${params.plugin.name}.${params.actionName} ok`
                    : `${params.plugin.name}.${params.actionName} failed`,
                payload: {
                    ...(data.data !== undefined ? { data: data.data } : {}),
                    ...(data.message ? { message: data.message } : {}),
                    ...(data.error ? { error: data.error } : {}),
                },
            });
            return;
        }
        printResult({
            asJson: bridgeOptions.json,
            success: false,
            title: `${params.plugin.name}.${params.actionName} failed`,
            payload: {
                error: remote.error || "Unknown error",
            },
        });
    });
}
/**
 * 注册所有受 agent 托管的 plugin actions CLI 命令。
 */
export function registerManagedPluginCommandsForCli(program, pluginsInput) {
    const plugins = listPluginsWithLifecycle(pluginsInput);
    for (const plugin of plugins) {
        for (const [actionName, action] of Object.entries(plugin.actions)) {
            registerPluginActionCommand({
                program,
                plugin,
                actionName,
                action: action,
            });
        }
    }
}
//# sourceMappingURL=ManagedPluginActionCommand.js.map