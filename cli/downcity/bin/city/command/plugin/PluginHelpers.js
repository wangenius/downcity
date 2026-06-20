/**
 * `city plugin` 命令组辅助函数。
 *
 * 关键点（中文）
 * - `city plugin` 提供 Agent 内部 plugin 目录入口。
 * - `list/info` 不依赖 agent，只展示内建 plugin 定义事实。
 * - City 不承载 plugin 运行态；运行态归属于具体 agent。
 * - `action` 仍保留为高级入口，真正执行时依赖具体 agent 项目。
 */
import fs from "node:fs";
import prompts from "../../../city/tui/Prompts.js";
import { listPluginViews, listPluginsWithLifecycle, listPluginsWithoutLifecycle, } from "@downcity/agent";
import { printResult } from "../../../city/utils/cli/CliOutput.js";
import { getDowncityJsonPath } from "../../../city/config/Paths.js";
import { emitCliBlock } from "../../../shared/CliReporter.js";
import { t } from "../../../shared/CliLocale.js";
import { resolveProjectRoot } from "../../../city/shared/PluginTargetSupport.js";
import { createCityStaticBuiltinPlugins } from "../../../city/runtime/plugins/CityBuiltinPlugins.js";
const CHAT_RUNTIME_ACTIONS_HIDDEN_FROM_CITY = new Set([
    "status",
    "test",
    "reconnect",
    "open",
    "close",
    "configuration",
    "configure",
]);
const CONTACT_REMOTE_ACTIONS_HIDDEN_FROM_CITY = new Set([
    "remoteping",
    "remoteapprove",
    "remoteconfirm",
    "remotechat",
    "remoteshare",
]);
export function createPluginCatalog() {
    return createCityStaticBuiltinPlugins();
}
export function createVisiblePluginCatalog() {
    return createPluginCatalog();
}
export function listVisiblePluginActions(pluginName, actions) {
    if (pluginName === "chat") {
        // 关键点（中文）：City 只展示 chat plugin 的用户操作能力，不展示 platform 运行态控制。
        return actions.filter((action) => !CHAT_RUNTIME_ACTIONS_HIDDEN_FROM_CITY.has(action));
    }
    if (pluginName === "contact") {
        // 关键点（中文）：remote* action 是 agent-to-agent 内部协议入口，不作为普通用户 action 展示。
        return actions.filter((action) => !CONTACT_REMOTE_ACTIONS_HIDDEN_FROM_CITY.has(action));
    }
    return actions;
}
export async function resolvePluginProjectRoot(options) {
    return { projectRoot: resolveProjectRoot(options.path) };
}
export function validatePluginProjectRoot(projectRoot) {
    const downcityJsonPath = getDowncityJsonPath(projectRoot);
    return fs.existsSync(downcityJsonPath)
        ? null
        : `Invalid plugin project path: ${projectRoot}. Missing: downcity.json`;
}
export function parseCommandPayload(raw) {
    if (typeof raw !== "string")
        return undefined;
    const text = raw.trim();
    if (!text)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
export function stripAnsi(input) {
    return String(input || "").replace(/\u001b\[[0-9;]*m/g, "");
}
export function truncateCell(input, width) {
    const text = String(input || "");
    if (stripAnsi(text).length <= width)
        return text;
    return `${text.slice(0, Math.max(0, width - 1))}…`;
}
export function renderPluginCatalogTable(rows) {
    if (rows.length === 0) {
        emitCliBlock({
            tone: "info",
            title: "Plugin catalog",
            summary: "0 plugins",
        });
        return;
    }
    const headers = ["plugin", "kind", "actions", "system", "title"];
    const dataRows = rows.map((row) => [
        row.name,
        row.kind,
        String(row.actionCount),
        row.hasSystem ? "yes" : "no",
        row.title,
    ]);
    const widths = headers.map((header, index) => Math.max(header.length, ...dataRows.map((row) => stripAnsi(String(row[index] || "")).length)));
    widths[4] = Math.min(Math.max(widths[4], 16), 44);
    const renderRow = (values) => values
        .map((value, index) => truncateCell(value, widths[index]).padEnd(widths[index], " "))
        .join("  ");
    console.log(renderRow([...headers]));
    console.log(widths.map((width) => "-".repeat(width)).join("  "));
    for (const row of dataRows) {
        console.log(renderRow(row));
    }
}
export function listStaticCatalogEntries() {
    const plugins = createVisiblePluginCatalog();
    const managedEntries = listPluginsWithLifecycle(plugins).map((plugin) => {
        const actions = listVisiblePluginActions(plugin.name, Object.keys(plugin.actions || {}).sort((left, right) => left.localeCompare(right)));
        return {
            name: plugin.name,
            title: String(plugin.title || plugin.name || "").trim() || plugin.name,
            kind: "agent-runtime",
            actionCount: actions.length,
            actions,
            hasSystem: typeof plugin.system === "function",
            note: "Runs inside an agent. City only shows the catalog here; runtime is owned by the agent process.",
        };
    });
    const localPlugins = listPluginsWithoutLifecycle(plugins);
    const localEntries = listPluginViews(localPlugins).map((plugin) => {
        return {
            name: plugin.name,
            title: plugin.title,
            kind: "action",
            actionCount: plugin.actions.length,
            actions: [...plugin.actions],
            hasSystem: plugin.hasSystem,
            note: "Action/system plugin. It runs through agent/plugin action execution, not City runtime.",
        };
    });
    const merged = [...managedEntries, ...localEntries];
    const unique = new Map();
    for (const entry of merged) {
        if (!unique.has(entry.name)) {
            unique.set(entry.name, entry);
        }
    }
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}
export function findStaticCatalogEntry(pluginName) {
    return listStaticCatalogEntries().find((item) => item.name === pluginName) || null;
}
export function formatPluginDescription(plugin) {
    return t({
        zh: [
            `标题：${plugin.title || plugin.name}`,
            `类型：${plugin.kind}`,
            `Actions：${plugin.actions.join(", ") || "none"}`,
            `System：${plugin.hasSystem ? "yes" : "no"}`,
            plugin.note ? `说明：${plugin.note}` : "",
            "",
            "Enter 查看该 Plugin 的完整能力详情。City 只展示能力目录，具体运行态归属于 Agent。",
        ].filter(Boolean).join("\n"),
        en: [
            `Title: ${plugin.title || plugin.name}`,
            `Kind: ${plugin.kind}`,
            `Actions: ${plugin.actions.join(", ") || "none"}`,
            `System: ${plugin.hasSystem ? "yes" : "no"}`,
            plugin.note ? `Note: ${plugin.note}` : "",
            "",
            "Press Enter to inspect this plugin's full capability details. City shows the catalog; runtime belongs to agents.",
        ].filter(Boolean).join("\n"),
    });
}
export async function promptPluginSelection() {
    const plugins = listStaticCatalogEntries();
    const response = (await prompts({
        type: "select",
        name: "selection",
        message: t({
            zh: "Plugin 能力",
            en: "Plugin capabilities",
        }),
        choices: [
            {
                title: t({ zh: "共享资源", en: "Shared resources" }),
                disabled: true,
            },
            {
                title: t({ zh: "Chat", en: "Chat" }),
                description: t({
                    zh: "管理 chat plugin 的 City 级账号、访问控制与共享会话资源。",
                    en: "Manage City-level accounts, access control, and shared conversation resources for the chat plugin.",
                }),
                value: {
                    type: "chat",
                },
            },
            {
                title: t({ zh: "Plugin 列表", en: "Plugins" }),
                disabled: true,
            },
            ...plugins.map((plugin) => ({
                title: plugin.name,
                description: formatPluginDescription(plugin),
                value: {
                    type: "plugin",
                    plugin_name: plugin.name,
                },
            })),
            {
                title: t({ zh: "导航", en: "Navigation" }),
                disabled: true,
            },
            {
                title: t({ zh: "退出", en: "Exit" }),
                description: t({
                    zh: "关闭 Plugin 能力管理器，返回终端。",
                    en: "Close the Plugin capability manager and return to the terminal.",
                }),
                value: {
                    type: "exit",
                },
            },
        ],
        initial: 1,
    }));
    return response.selection || null;
}
export async function promptPluginName(message) {
    const plugins = listStaticCatalogEntries();
    const response = (await prompts({
        type: "select",
        name: "pluginName",
        message,
        choices: plugins.map((plugin) => ({
            title: plugin.name,
            description: t({
                zh: `${plugin.title || plugin.name} · ${plugin.kind} · ${plugin.actionCount} 个 action。${plugin.note || ""}`,
                en: `${plugin.title || plugin.name} · ${plugin.kind} · ${plugin.actionCount} actions. ${plugin.note || ""}`,
            }),
            value: plugin.name,
        })),
        initial: 0,
    }));
    const pluginName = String(response.pluginName || "").trim();
    return pluginName || null;
}
export async function resolveInteractivePluginName(params) {
    const explicit = String(params.pluginName || "").trim();
    if (explicit)
        return explicit;
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        emitCliBlock({
            tone: "error",
            title: "Plugin name is required",
            note: "Use `city plugin info <pluginName>` or run this command in an interactive terminal.",
        });
        return null;
    }
    const selected = await promptPluginName(params.message);
    if (!selected) {
        emitCliBlock({
            tone: "info",
            title: "Plugin selection cancelled",
        });
        return null;
    }
    return selected;
}
export async function runPluginListCommand(options) {
    const plugins = listStaticCatalogEntries();
    if (options.json !== true) {
        renderPluginCatalogTable(plugins.map((plugin) => ({
            name: plugin.name,
            title: plugin.title,
            kind: plugin.kind,
            actionCount: plugin.actionCount,
            hasSystem: plugin.hasSystem,
        })));
        return;
    }
    printResult({
        asJson: true,
        success: true,
        title: "plugins listed",
        payload: {
            plugins,
        },
    });
}
export async function runPluginInfoCommand(params) {
    const pluginName = await resolveInteractivePluginName({
        pluginName: params.pluginName,
        message: t({
            zh: "选择要查看的 Plugin",
            en: "Select a plugin to inspect",
        }),
    });
    if (!pluginName) {
        return;
    }
    const plugin = findStaticCatalogEntry(pluginName);
    if (!plugin) {
        printResult({
            asJson: params.options.json === true,
            success: false,
            title: "plugin info failed",
            payload: {
                error: `Unknown plugin: ${pluginName}`,
            },
        });
        return;
    }
    if (params.options.json !== true) {
        emitCliBlock({
            tone: "info",
            title: `Plugin ${pluginName}`,
            summary: plugin.kind,
            facts: [
                {
                    label: "title",
                    value: plugin.title || pluginName,
                },
                {
                    label: "kind",
                    value: plugin.kind,
                },
                {
                    label: "actions",
                    value: plugin.actions.join(", ") || "none",
                },
                {
                    label: "system",
                    value: plugin.hasSystem ? "yes" : "no",
                },
                ...(plugin.note
                    ? [
                        {
                            label: "note",
                            value: plugin.note,
                        },
                    ]
                    : []),
            ],
        });
        return;
    }
    printResult({
        asJson: true,
        success: true,
        title: "plugin info ok",
        payload: {
            pluginName,
            plugin,
        },
    });
}
//# sourceMappingURL=PluginHelpers.js.map