/**
 * `town plugin` 命令组。
 *
 * 关键点（中文）
 * - `town plugin` 提供 Agent 内部 plugin 目录入口。
 * - `list/info` 不依赖 agent，只展示内建 plugin 定义事实。
 * - Town 不承载 plugin 运行态；运行态归属于具体 agent。
 * - `action` 仍保留为高级入口，真正执行时依赖具体 agent 项目。
 */

import fs from "node:fs";
import type { Command } from "commander";
import prompts from "../tui/Prompts.js";
import {
  listPluginViews,
  listPluginsWithLifecycle,
  listPluginsWithoutLifecycle,
  runLocalPluginAction,
} from "@downcity/agent";
import { printResult } from "../utils/cli/CliOutput.js";
import type { JsonValue } from "@downcity/agent";
import { getDowncityJsonPath } from "../config/Paths.js";
import type { PluginCliBaseOptions } from "@downcity/agent";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { parseBoolean, parsePort } from "../../shared/IndexSupport.js";
import { helpText, t } from "../../shared/CliLocale.js";
import { resolveProjectRoot } from "../shared/PluginTargetSupport.js";
import { runManagedPluginCommandBridge } from "../shared/ManagedPluginRemote.js";
import { registerPluginScheduleCommands } from "./PluginScheduleCommand.js";
import { runInteractiveChatManager } from "../shared/ChatManager.js";
import { createTownStaticBuiltinPlugins } from "../town/plugins/TownBuiltinPlugins.js";

type StaticCatalogEntry = {
  name: string;
  title: string;
  kind: "agent-runtime" | "action";
  actionCount: number;
  actions: string[];
  hasSystem: boolean;
  note?: string;
};

const CHAT_RUNTIME_ACTIONS_HIDDEN_FROM_TOWN = new Set([
  "status",
  "test",
  "reconnect",
  "open",
  "close",
  "configuration",
  "configure",
]);

const CONTACT_REMOTE_ACTIONS_HIDDEN_FROM_TOWN = new Set([
  "remoteping",
  "remoteapprove",
  "remoteconfirm",
  "remotechat",
  "remoteshare",
]);

function createPluginCatalog() {
  return createTownStaticBuiltinPlugins();
}

function createVisiblePluginCatalog() {
  return createPluginCatalog();
}

function listVisiblePluginActions(pluginName: string, actions: string[]): string[] {
  if (pluginName === "chat") {
    // 关键点（中文）：Town 只展示 chat plugin 的用户操作能力，不展示 platform 运行态控制。
    return actions.filter((action) => !CHAT_RUNTIME_ACTIONS_HIDDEN_FROM_TOWN.has(action));
  }
  if (pluginName === "contact") {
    // 关键点（中文）：remote* action 是 agent-to-agent 内部协议入口，不作为普通用户 action 展示。
    return actions.filter((action) => !CONTACT_REMOTE_ACTIONS_HIDDEN_FROM_TOWN.has(action));
  }
  return actions;
}

async function resolvePluginProjectRoot(options: PluginCliBaseOptions): Promise<{
  projectRoot?: string;
  error?: string;
}> {
  return { projectRoot: resolveProjectRoot(options.path) };
}

function validatePluginProjectRoot(projectRoot: string): string | null {
  const downcityJsonPath = getDowncityJsonPath(projectRoot);
  return fs.existsSync(downcityJsonPath)
    ? null
    : `Invalid plugin project path: ${projectRoot}. Missing: downcity.json`;
}

function parseCommandPayload(raw?: string): JsonValue | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

function stripAnsi(input: string): string {
  return String(input || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function truncateCell(input: string, width: number): string {
  const text = String(input || "");
  if (stripAnsi(text).length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function renderPluginCatalogTable(rows: Array<{
  name: string;
  title: string;
  kind: "agent-runtime" | "action";
  actionCount: number;
  hasSystem: boolean;
}>): void {
  if (rows.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "Plugin catalog",
      summary: "0 plugins",
    });
    return;
  }

  const headers = ["plugin", "kind", "actions", "system", "title"] as const;
  const dataRows = rows.map((row) => [
    row.name,
    row.kind,
    String(row.actionCount),
    row.hasSystem ? "yes" : "no",
    row.title,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...dataRows.map((row) => stripAnsi(String(row[index] || "")).length),
    ),
  );
  widths[4] = Math.min(Math.max(widths[4], 16), 44);

  const renderRow = (values: string[]): string =>
    values
      .map((value, index) => truncateCell(value, widths[index]).padEnd(widths[index], " "))
      .join("  ");

  console.log(renderRow([...headers]));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of dataRows) {
    console.log(renderRow(row));
  }
}

function listStaticCatalogEntries(): StaticCatalogEntry[] {
  const plugins = createVisiblePluginCatalog();
  const managedEntries = listPluginsWithLifecycle(plugins).map((plugin) => {
    const actions = listVisiblePluginActions(
      plugin.name,
      Object.keys(plugin.actions || {}).sort((left, right) => left.localeCompare(right)),
    );
    return {
      name: plugin.name,
      title: String(plugin.title || plugin.name || "").trim() || plugin.name,
      kind: "agent-runtime" as const,
      actionCount: actions.length,
      actions,
      hasSystem: typeof plugin.system === "function",
      note: "Runs inside an agent. Town only shows the catalog here; runtime is owned by the agent process.",
    };
  });

  const localPlugins = listPluginsWithoutLifecycle(plugins);
  const localEntries = listPluginViews(localPlugins).map((plugin) => {
    return {
      name: plugin.name,
      title: plugin.title,
      kind: "action" as const,
      actionCount: plugin.actions.length,
      actions: [...plugin.actions],
      hasSystem: plugin.hasSystem,
      note: "Action/system plugin. It runs through agent/plugin action execution, not Town runtime.",
    };
  });

  const merged = [...managedEntries, ...localEntries];
  const unique = new Map<string, StaticCatalogEntry>();
  for (const entry of merged) {
    if (!unique.has(entry.name)) {
      unique.set(entry.name, entry);
    }
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function findStaticCatalogEntry(pluginName: string): StaticCatalogEntry | null {
  return listStaticCatalogEntries().find((item) => item.name === pluginName) || null;
}

type plugin_manager_selection =
  | {
      /** 选择类型：进入 Chat 共享资源管理器。 */
      type: "chat";
    }
  | {
      /** 选择类型：查看某个 Plugin。 */
      type: "plugin";

      /** 目标 Plugin 名称。 */
      plugin_name: string;
    }
  | {
      /** 选择类型：退出 Plugin 管理器。 */
      type: "exit";
    };

function formatPluginDescription(plugin: StaticCatalogEntry): string {
  return t({
    zh: [
      `标题：${plugin.title || plugin.name}`,
      `类型：${plugin.kind}`,
      `Actions：${plugin.actions.join(", ") || "none"}`,
      `System：${plugin.hasSystem ? "yes" : "no"}`,
      plugin.note ? `说明：${plugin.note}` : "",
      "",
      "Enter 查看该 Plugin 的完整能力详情。Town 只展示能力目录，具体运行态归属于 Agent。",
    ].filter(Boolean).join("\n"),
    en: [
      `Title: ${plugin.title || plugin.name}`,
      `Kind: ${plugin.kind}`,
      `Actions: ${plugin.actions.join(", ") || "none"}`,
      `System: ${plugin.hasSystem ? "yes" : "no"}`,
      plugin.note ? `Note: ${plugin.note}` : "",
      "",
      "Press Enter to inspect this plugin's full capability details. Town shows the catalog; runtime belongs to agents.",
    ].filter(Boolean).join("\n"),
  });
}

async function promptPluginSelection(): Promise<plugin_manager_selection | null> {
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
          zh: "管理 chat plugin 的 Town 级账号、访问控制与共享会话资源。",
          en: "Manage Town-level accounts, access control, and shared conversation resources for the chat plugin.",
        }),
        value: {
          type: "chat" as const,
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
          type: "plugin" as const,
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
          type: "exit" as const,
        },
      },
    ],
    initial: 1,
  })) as { selection?: plugin_manager_selection };

  return response.selection || null;
}

async function promptPluginName(message: string): Promise<string | null> {
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
  })) as { pluginName?: string };
  const pluginName = String(response.pluginName || "").trim();
  return pluginName || null;
}

async function resolveInteractivePluginName(params: {
  pluginName?: string;
  message: string;
}): Promise<string | null> {
  const explicit = String(params.pluginName || "").trim();
  if (explicit) return explicit;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emitCliBlock({
      tone: "error",
      title: "Plugin name is required",
      note: "Use `town plugin info <pluginName>` or run this command in an interactive terminal.",
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

async function runPluginListCommand(options: { json?: boolean }): Promise<void> {
  const plugins = listStaticCatalogEntries();
  if (options.json !== true) {
    renderPluginCatalogTable(
      plugins.map((plugin) => ({
        name: plugin.name,
        title: plugin.title,
        kind: plugin.kind,
        actionCount: plugin.actionCount,
        hasSystem: plugin.hasSystem,
      })),
    );
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

async function runPluginInfoCommand(params: {
  pluginName?: string;
  options: { json?: boolean };
}): Promise<void> {
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

export async function runInteractivePluginManager(): Promise<void> {
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
    } catch (error) {
      emitCliBlock({
        tone: "error",
        title: "Plugin manager action failed",
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function runPluginActionCommand(params: {
  pluginName: string;
  actionName: string;
  payload?: string;
  options: PluginCliBaseOptions;
}): Promise<void> {
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
 * 注册 `town plugin` 命令组。
 */
export function registerPluginsCommand(program: Command): void {
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
    .action(async (opts: { json?: boolean }) => {
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
    .action(async (pluginName: string | undefined, opts: { json?: boolean }) => {
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
      zh: "覆盖 Bearer Token（按 Town Agent HTTP gateway 调用时可选）",
      en: "override the Bearer Token for Town Agent HTTP gateway calls",
    }))
    .option("--json [enabled]", t({
      zh: "以 JSON 输出",
      en: "output as JSON",
    }), parseBoolean, true)
    .helpOption("--help", helpText())
    .action(async (
      pluginName: string,
      command: string,
      opts: PluginCliBaseOptions & { payload?: string },
    ) => {
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
    .action(
      async (
        pluginName: string,
        actionName: string,
        opts: PluginCliBaseOptions & { payload?: string },
      ) => {
        await runPluginActionCommand({
          pluginName,
          actionName,
          payload: opts.payload,
          options: opts,
        });
      },
    );

  registerPluginScheduleCommands(plugin);
}
