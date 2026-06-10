/**
 * Town 顶层全屏 TUI 仪表盘。
 *
 * 关键点（中文）
 * - 这是裸 `town` 的默认入口。
 * - 左侧 sidebar 承载动作菜单与 breadcrumb，右侧 main_section 展示当前动作说明。
 * - 动作结束后返回仪表盘，形成统一终端操作台体验。
 */

import blessed from "neo-blessed";
import { readFileSync } from "node:fs";
import { readTownCityConnectionState } from "../shared/CityConnection.js";
import { getCliLocale, t } from "../shared/CliLocale.js";
import { readTownPid, isTownProcessAlive } from "../process/registry/TownRuntime.js";
import { resolveRunningManagedAgents } from "../town/gateway/runtime/GatewayProcess.js";
import type { TownCityConnectionState } from "../types/TownCityConnection.js";
import type { tui_action_result, tui_list_item } from "../types/Tui.js";

type town_home_action =
  | "status"
  | "start"
  | "stop"
  | "restart"
  | "city"
  | "agent"
  | "plugin"
  | "language"
  | "help"
  | "exit";

interface town_dashboard_options {
  /** 执行顶层动作。 */
  run_action: (action: town_home_action) => Promise<tui_action_result>;
}

interface blessed_list_element extends blessed.Widgets.ListElement {
  on: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  key: (
    keys: string | string[],
    listener: (...args: unknown[]) => void,
  ) => blessed_list_element;
  focus: () => void;
  setItems: (items: blessed.Widgets.ListElementItem[]) => void;
  selected?: number;
}

interface town_dashboard_shell {
  /** blessed 全屏根节点。 */
  screen: blessed.Widgets.Screen;

  /** 左侧 sidebar 容器。 */
  sidebar_box: blessed.Widgets.BoxElement;

  /** sidebar 顶部 breadcrumb。 */
  breadcrumb_box: blessed.Widgets.BoxElement;

  /** 右侧主内容区。 */
  main_box: blessed.Widgets.BoxElement;

  /** 底部操作提示。 */
  footer_box: blessed.Widgets.BoxElement;
}

interface town_dashboard_state {
  title: string;
  subtitle: string;
  footer: string;
  items: tui_list_item[];
}

/**
 * 打开 Town 顶层仪表盘。
 */
export async function open_town_dashboard(
  options: town_dashboard_options,
): Promise<void> {
  while (true) {
    const state = await build_town_dashboard_state();
    const selection = await run_town_dashboard_once(state);
    if (!selection) {
      return;
    }

    const result = await options.run_action(selection as town_home_action);
    if (result === "quit") {
      return;
    }
  }
}

async function build_town_dashboard_state(): Promise<town_dashboard_state> {
  const version = read_town_cli_version();
  const locale = getCliLocale();
  const pid = await readTownPid();
  const running = Boolean(pid && isTownProcessAlive(pid));
  const city_state = readTownCityConnectionState();
  const managed_agents = await safe_count_running_agents();

  const items: tui_list_item[] = [
    {
      id: "status",
      title: t({ zh: "查看总览", en: "View overview" }),
      subtitle: build_status_subtitle(running, managed_agents),
      detail: build_status_detail({
        running,
        pid,
        city_state,
        managed_agents,
      }),
    },
    {
      id: "start",
      title: t({ zh: "启动 Town", en: "Start Town" }),
      subtitle: running
        ? t({ zh: "当前 runtime 已运行", en: "runtime already running" })
        : t({ zh: "启动本机 Town runtime", en: "start the local Town runtime" }),
      detail: t({
        zh: "启动 Town runtime。若已运行，会直接返回当前状态。",
        en: "Start the Town runtime. If it is already running, Town returns the current state.",
      }),
    },
    {
      id: "stop",
      title: t({ zh: "停止 Town", en: "Stop Town" }),
      subtitle: running
        ? t({ zh: "停止 runtime 与托管 agent", en: "stop runtime and managed agents" })
        : t({ zh: "当前 runtime 已停止", en: "runtime already stopped" }),
      detail: t({
        zh: "停止 Town runtime，并清理当前受管 agent daemon。",
        en: "Stop the Town runtime and clean up currently managed agent daemons.",
      }),
    },
    {
      id: "restart",
      title: t({ zh: "重启 Town", en: "Restart Town" }),
      subtitle: t({
        zh: "重启 runtime 并恢复受管状态",
        en: "restart runtime and recover managed state",
      }),
      detail: t({
        zh: "重启 Town runtime，并尝试恢复此前托管的 agent 运行态。",
        en: "Restart the Town runtime and try to recover previously managed agent runtime state.",
      }),
    },
    {
      id: "city",
      title: t({ zh: "连接 City", en: "Connect City" }),
      subtitle: build_city_subtitle(city_state),
      detail: build_city_detail(city_state),
    },
    {
      id: "agent",
      title: t({ zh: "管理 Agent", en: "Manage agents" }),
      subtitle: t({
        zh: `${managed_agents} 个运行中 agent`,
        en: `${managed_agents} running agents`,
      }),
      detail: t({
        zh: "进入 Agent 管理器，继续创建、查看、启动、停止、聊天与绑定配置。",
        en: "Open the Agent manager to create, inspect, start, stop, chat, and configure bindings.",
      }),
    },
    {
      id: "plugin",
      title: t({ zh: "配置 Plugins", en: "Configure plugins" }),
      subtitle: t({
        zh: "管理可用 plugin 能力",
        en: "manage available plugin capabilities",
      }),
      detail: t({
        zh: "进入 Plugin 管理器，继续查看、启用和配置 Agent 可用 plugin 能力。",
        en: "Open the Plugin manager to inspect, enable, and configure Agent plugin capabilities.",
      }),
    },
    {
      id: "language",
      title: t({ zh: "切换语言", en: "Language" }),
      subtitle: locale === "zh"
        ? t({ zh: "当前默认语言：中文", en: "Current default language: Chinese" })
        : t({ zh: "当前默认语言：英文", en: "Current default language: English" }),
      detail: t({
        zh: "切换 Town CLI 的默认语言，并保存到本地状态里。",
        en: "Switch the default Town CLI language and persist it into local state.",
      }),
    },
    {
      id: "help",
      title: t({ zh: "查看帮助", en: "Show help" }),
      subtitle: t({ zh: "输出 `town --help`", en: "print `town --help`" }),
      detail: t({
        zh: "输出当前 Town 根命令帮助，适合查阅脚本化子命令。",
        en: "Print the current Town root help, useful when looking up scriptable subcommands.",
      }),
    },
    {
      id: "exit",
      title: t({ zh: "退出", en: "Exit" }),
      subtitle: t({ zh: "关闭 Town", en: "Close Town" }),
      detail: t({
        zh: "退出当前 Town CLI。",
        en: "Exit the current Town CLI.",
      }),
    },
  ];

  return {
    title: `Town v${version}`,
    subtitle: t({
      zh: `runtime：${runtime_state_text(running)} · City：${build_city_subtitle(city_state)} · agent：${managed_agents}`,
      en: `runtime: ${runtime_state_text(running)} · City: ${build_city_subtitle(city_state)} · agents: ${managed_agents}`,
    }),
    footer: t({
      zh: "Enter 进入动作 · Esc / q 退出 · ↑↓ 切换 · 当前入口：全屏 TUI",
      en: "Enter run action · Esc / q quit · ↑↓ navigate · current entry: full-screen TUI",
    }),
    items,
  };
}

async function run_town_dashboard_once(
  state: town_dashboard_state,
): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    const shell = create_town_dashboard_shell(state);
    const { screen } = shell;

    let finished = false;
    let selected_index = 0;

    const finish = (value: string | null): void => {
      if (finished) return;
      finished = true;
      screen.destroy();
      resolve(value);
    };

    const list = blessed.list({
      parent: shell.sidebar_box,
      top: 2,
      left: 0,
      width: "100%",
      height: "100%-2",
      keys: true,
      vi: true,
      mouse: true,
      style: {
        item: { fg: "white" },
        selected: {
          fg: "black",
          bg: "green",
          bold: true,
        },
      },
      items: state.items.map(format_list_label),
    }) as blessed_list_element;

    const detail = blessed.box({
      parent: shell.main_box,
      top: 4,
      left: 0,
      width: "100%",
      height: "100%-4",
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      style: {
        fg: "white",
      },
      content: format_detail_content(state.items[0]),
    });

    const sync_selection = (index_value: unknown = list.selected): void => {
      selected_index = clamp_selected_index(index_value, state.items.length, selected_index);
      const next_item = state.items[selected_index];
      if (!next_item) return;
      detail.setContent(format_detail_content(next_item));
      shell.footer_box.setContent(format_footer(state.footer, next_item));
      screen.render();
    };

    list.on("select item", (_item, index_value) => {
      sync_selection(index_value);
    });

    list.on("keypress", () => {
      // 关键点（中文）：上下移动焦点时立即刷新右侧说明，不能只在 Enter 选择时刷新。
      setImmediate(() => {
        if (finished) return;
        sync_selection();
      });
    });

    list.key(["enter"], () => {
      sync_selection();
      finish(state.items[selected_index]?.id ?? null);
    });

    detail.key(["pageup"], () => {
      detail.scroll(-Math.max(1, Math.floor((detail.height as number) / 2)));
      screen.render();
    });

    detail.key(["pagedown"], () => {
      detail.scroll(Math.max(1, Math.floor((detail.height as number) / 2)));
      screen.render();
    });

    screen.key(["escape", "q", "C-c"], () => finish(null));

    list.focus();
    sync_selection(selected_index);
    screen.render();
  });
}

function create_town_dashboard_shell(state: town_dashboard_state): town_dashboard_shell {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "Downcity Town",
    dockBorders: true,
    autoPadding: true,
  });

  screen.style = {
    bg: "black",
    fg: "white",
  };

  const sidebar_box = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "34%",
    height: "100%-3",
    border: "line",
    label: ` ${t({ zh: "侧边栏", en: "Sidebar" })} `,
    style: {
      border: { fg: "green" },
    },
  });

  const breadcrumb_box = blessed.box({
    parent: sidebar_box,
    top: 0,
    left: 1,
    width: "100%-2",
    height: 2,
    content: format_breadcrumb(state.title),
    style: {
      fg: "green",
      bold: true,
    },
  });

  const main_box = blessed.box({
    parent: screen,
    top: 0,
    left: "34%",
    width: "66%",
    height: "100%-3",
    border: "line",
    label: ` ${t({ zh: "主区域", en: "Main" })} `,
    style: {
      border: { fg: "green" },
    },
  });

  blessed.box({
    parent: main_box,
    top: 0,
    left: 1,
    width: "100%-2",
    height: 3,
    tags: true,
    content: `{bold}${state.title}{/bold}\n${state.subtitle}`,
  });

  const footer_box = blessed.box({
    parent: screen,
    left: 0,
    bottom: 0,
    width: "100%",
    height: 3,
    padding: { left: 1, right: 1, top: 1 },
    border: "line",
    style: {
      border: { fg: "green" },
      fg: "gray",
    },
    content: state.footer,
  });

  return {
    screen,
    sidebar_box,
    breadcrumb_box,
    main_box,
    footer_box,
  };
}

async function safe_count_running_agents(): Promise<number> {
  try {
    return (await resolveRunningManagedAgents({ syncRegistry: false })).length;
  } catch {
    return 0;
  }
}

function build_status_subtitle(running: boolean, managed_agents: number): string {
  return running
    ? t({
      zh: `runtime 运行中 · ${managed_agents} 个 agent 活跃`,
      en: `runtime running · ${managed_agents} active agents`,
    })
    : t({
      zh: `runtime 已停止 · ${managed_agents} 个 agent 活跃`,
      en: `runtime stopped · ${managed_agents} active agents`,
    });
}

function build_status_detail(params: {
  running: boolean;
  pid: number | null;
  city_state: TownCityConnectionState;
  managed_agents: number;
}): string {
  return t({
    zh: [
      `{bold}Town runtime{/bold}`,
      `状态：${runtime_state_text(params.running)}`,
      `PID：${params.pid ?? unknown_text()}`,
      "",
      `{bold}City 连接{/bold}`,
      `base：${params.city_state.city_url}`,
      `source：${params.city_state.source}`,
      `user token：${configured_state_text(params.city_state.has_user_token)}`,
      `town id：${params.city_state.town_id}`,
      "",
      `{bold}托管 Agent{/bold}`,
      `运行中：${params.managed_agents}`,
      "",
      "选择该动作后会打印现有 `town status` 文本总览。",
    ].join("\n"),
    en: [
      `{bold}Town runtime{/bold}`,
      `state: ${runtime_state_text(params.running)}`,
      `PID: ${params.pid ?? unknown_text()}`,
      "",
      `{bold}City connection{/bold}`,
      `base: ${params.city_state.city_url}`,
      `source: ${params.city_state.source}`,
      `user token: ${configured_state_text(params.city_state.has_user_token)}`,
      `town id: ${params.city_state.town_id}`,
      "",
      `{bold}Managed agents{/bold}`,
      `running: ${params.managed_agents}`,
      "",
      "Selecting this action prints the existing `town status` text overview.",
    ].join("\n"),
  });
}

function build_city_subtitle(city_state: TownCityConnectionState): string {
  if (city_state.has_user_token) {
    return t({
      zh: `${city_state.city_url} · 已登录`,
      en: `${city_state.city_url} · signed in`,
    });
  }

  return t({
    zh: `${city_state.city_url} · 未登录`,
    en: `${city_state.city_url} · not signed in`,
  });
}

function build_city_detail(city_state: TownCityConnectionState): string {
  return t({
    zh: [
      `{bold}当前 City 连接{/bold}`,
      `base：${city_state.city_url}`,
      `source：${city_state.source}`,
      `town id：${city_state.town_id}`,
      `user token：${configured_state_text(city_state.has_user_token)}`,
      city_state.user_id ? `user id：${city_state.user_id}` : "",
      "",
      "选择后进入现有 `town city` 交互管理器，继续 connect / use / login / recharge 等流程。",
    ].filter(Boolean).join("\n"),
    en: [
      `{bold}Current City connection{/bold}`,
      `base: ${city_state.city_url}`,
      `source: ${city_state.source}`,
      `town id: ${city_state.town_id}`,
      `user token: ${configured_state_text(city_state.has_user_token)}`,
      city_state.user_id ? `user id: ${city_state.user_id}` : "",
      "",
      "Selecting this opens the existing `town city` interactive manager for connect, use, login, recharge, and related flows.",
    ].filter(Boolean).join("\n"),
  });
}

/**
 * runtime 状态显示文案。
 */
function runtime_state_text(running: boolean): string {
  return running
    ? t({ zh: "运行中", en: "running" })
    : t({ zh: "已停止", en: "stopped" });
}

/**
 * 配置状态显示文案。
 */
function configured_state_text(configured: boolean): string {
  return configured
    ? t({ zh: "已配置", en: "configured" })
    : t({ zh: "缺失", en: "missing" });
}

/**
 * 未知值显示文案。
 */
function unknown_text(): string {
  return t({ zh: "未知", en: "unknown" });
}

function format_list_label(item: tui_list_item): string {
  return item.title;
}

function format_detail_content(item: tui_list_item): string {
  return `{bold}${item.title}{/bold}\n${item.subtitle}\n\n${item.detail}`;
}

function format_footer(base_footer: string, item: tui_list_item | undefined): string {
  if (!item) return base_footer;
  return `${base_footer} · ${item.subtitle}`;
}

function format_breadcrumb(value: string): string {
  return value.padEnd(80, " ");
}

function clamp_selected_index(
  value: unknown,
  length: number,
  fallback: number,
): number {
  if (length <= 0) return 0;
  const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
  return Math.max(0, Math.min(length - 1, index));
}

function read_town_cli_version(): string {
  try {
    const package_json_path = new URL("../../package.json", import.meta.url);
    const package_json = JSON.parse(readFileSync(package_json_path, "utf8")) as {
      version?: string;
    };
    return String(package_json.version ?? "unknown");
  } catch {
    return "unknown";
  }
}
