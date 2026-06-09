/**
 * Town 顶层全屏 TUI 仪表盘。
 *
 * 关键点（中文）
 * - 这是裸 `town` 的默认入口。
 * - 进入具体动作前销毁 TUI，再复用现有命令/交互流程。
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
      zh: `runtime：${running ? "running" : "stopped"} · City：${build_city_subtitle(city_state)} · agent：${managed_agents}`,
      en: `runtime: ${running ? "running" : "stopped"} · City: ${build_city_subtitle(city_state)} · agents: ${managed_agents}`,
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
    const screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      title: "Downcity Town",
      dockBorders: true,
      autoPadding: true,
    });

    let finished = false;

    const finish = (value: string | null): void => {
      if (finished) return;
      finished = true;
      screen.destroy();
      resolve(value);
    };

    const root = blessed.box({
      parent: screen,
      width: "100%",
      height: "100%",
      style: {
        fg: "white",
        bg: "black",
      },
    });

    blessed.box({
      parent: root,
      top: 0,
      left: 0,
      width: "100%",
      height: 4,
      tags: true,
      padding: { left: 1, right: 1, top: 1 },
      content: `{bold}${state.title}{/bold}\n${state.subtitle}`,
      border: "line",
      style: {
        border: { fg: "green" },
      },
    });

    const list = blessed.list({
      parent: root,
      top: 4,
      left: 0,
      width: "42%",
      height: "shrink",
      bottom: 3,
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      label: ` ${t({ zh: "动作", en: "Actions" })} `,
      style: {
        border: { fg: "green" },
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
      parent: root,
      top: 4,
      left: "42%",
      width: "58%",
      height: "shrink",
      bottom: 3,
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      border: "line",
      label: ` ${t({ zh: "详情", en: "Details" })} `,
      style: {
        border: { fg: "green" },
      },
      content: format_detail_content(state.items[0]),
    });

    blessed.box({
      parent: root,
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

    list.on("select item", (_item, index_value) => {
      const index: number = typeof index_value === "number" ? index_value : 0;
      const next_item = state.items[index];
      if (!next_item) return;
      detail.setContent(format_detail_content(next_item));
      screen.render();
    });

    list.key(["enter"], () => {
      const index = typeof list.selected === "number" ? list.selected : 0;
      finish(state.items[index]?.id ?? null);
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
    screen.render();
  });
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
      `状态：${params.running ? "running" : "stopped"}`,
      `PID：${params.pid ?? "unknown"}`,
      "",
      `{bold}City 连接{/bold}`,
      `base：${params.city_state.city_url}`,
      `source：${params.city_state.source}`,
      `user token：${params.city_state.has_user_token ? "configured" : "missing"}`,
      `town id：${params.city_state.town_id}`,
      "",
      `{bold}托管 Agent{/bold}`,
      `运行中：${params.managed_agents}`,
      "",
      "选择该动作后会打印现有 `town status` 文本总览。",
    ].join("\n"),
    en: [
      `{bold}Town runtime{/bold}`,
      `state: ${params.running ? "running" : "stopped"}`,
      `PID: ${params.pid ?? "unknown"}`,
      "",
      `{bold}City connection{/bold}`,
      `base: ${params.city_state.city_url}`,
      `source: ${params.city_state.source}`,
      `user token: ${params.city_state.has_user_token ? "configured" : "missing"}`,
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
      `user token：${city_state.has_user_token ? "configured" : "missing"}`,
      city_state.user_id ? `user id：${city_state.user_id}` : "",
      "",
      "选择后进入现有 `town city` 交互管理器，继续 connect / use / login / recharge 等流程。",
    ].filter(Boolean).join("\n"),
    en: [
      `{bold}Current City connection{/bold}`,
      `base: ${city_state.city_url}`,
      `source: ${city_state.source}`,
      `town id: ${city_state.town_id}`,
      `user token: ${city_state.has_user_token ? "configured" : "missing"}`,
      city_state.user_id ? `user id: ${city_state.user_id}` : "",
      "",
      "Selecting this opens the existing `town city` interactive manager for connect, use, login, recharge, and related flows.",
    ].filter(Boolean).join("\n"),
  });
}

function format_list_label(item: tui_list_item): string {
  return `${item.title}\n${item.subtitle}`;
}

function format_detail_content(item: tui_list_item): string {
  return `{bold}${item.title}{/bold}\n${item.subtitle}\n\n${item.detail}`;
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
