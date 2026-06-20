/**
 * City 顶层全屏 TUI 仪表盘。
 *
 * 关键点（中文）
 * - 这是裸 `city` 的默认入口。
 * - 左侧 sidebar 承载动作菜单与 breadcrumb，右侧 main_section 展示当前动作说明。
 * - 动作结束后返回仪表盘，形成统一终端操作台体验。
 */

import blessed from "neo-blessed";
import { readFileSync } from "node:fs";
import { read_federation_membership_state } from "../shared/FederationConnection.js";
import { getCliLocale, t } from "../../shared/CliLocale.js";
import { readCityPid, isCityProcessAlive } from "../process/registry/CityRuntime.js";
import { resolveRunningManagedAgents } from "../runtime/gateway/runtime/GatewayProcess.js";
import type { FederationMembershipState } from "../types/FederationMembership.js";
import type { tui_action_result, tui_list_item } from "../types/Tui.js";
import {
  is_disabled_selectable_item,
  resolve_loop_selectable_index,
  resolve_next_loop_selectable_index,
} from "./SelectableList.js";

type city_home_action =
  | "stop"
  | "restart"
  | "federation"
  | "agent"
  | "plugin"
  | "language"
  | "help"
  | "exit";

interface city_dashboard_options {
  /** 执行顶层动作。 */
  run_action: (action: city_home_action) => Promise<tui_action_result>;
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
  select: (index: number) => void;
  setItems: (items: blessed.Widgets.ListElementItem[]) => void;
  selected?: number;
}

interface city_dashboard_shell {
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

interface city_dashboard_state {
  title: string;
  subtitle: string;
  footer: string;
  items: tui_list_item[];
}

/**
 * 打开 City 顶层仪表盘。
 */
export async function open_city_dashboard(
  options: city_dashboard_options,
): Promise<void> {
  while (true) {
    const state = await build_city_dashboard_state();
    const selection = await run_city_dashboard_once(state);
    if (!selection) {
      return;
    }

    const result = await options.run_action(selection as city_home_action);
    if (result === "quit") {
      return;
    }
  }
}

async function build_city_dashboard_state(): Promise<city_dashboard_state> {
  const version = read_city_cli_version();
  const locale = getCliLocale();
  const pid = await readCityPid();
  const running = Boolean(pid && isCityProcessAlive(pid));
  const city_state = read_federation_membership_state();
  const managed_agents = await safe_count_running_agents();

  const items: tui_list_item[] = [
    section_item("management", t({ zh: "管理", en: "Management" })),
    {
      id: "agent",
      title: t({ zh: "Agent 管理", en: "Agent management" }),
      subtitle: t({
        zh: `${managed_agents} 个运行中 agent`,
        en: `${managed_agents} running agents`,
      }),
      detail: t({
        zh: "进入 Agent 列表。右侧会展示当前聚焦 Agent 的状态；点进某个 Agent 后再启动、停止、重启、聊天或修改配置。列表底部可创建新的 Agent。",
        en: "Open the Agent list. The main section shows the focused agent status; open an agent to start, stop, restart, chat, or edit settings. Create a new agent from the bottom of the list.",
      }),
    },
    {
      id: "federation",
      title: t({ zh: "Federation", en: "Federation" }),
      subtitle: build_federation_subtitle(city_state),
      detail: build_federation_detail(city_state),
    },
    {
      id: "plugin",
      title: t({ zh: "Plugin 能力", en: "Plugin capabilities" }),
      subtitle: t({
        zh: "查看 plugin 目录、Chat 共享资源与能力边界",
        en: "inspect plugins, Chat shared resources, and capability boundaries",
      }),
      detail: t({
        zh: "进入 Plugin 能力管理器。Chat 共享资源已归入这里；这里也展示当前已注册的 plugin、actions、system 能力和运行边界。",
        en: "Open the Plugin capability manager. Chat shared resources now live here, alongside registered plugins, actions, system capabilities, and runtime boundaries.",
      }),
    },
    section_item("settings", t({ zh: "设置", en: "Settings" })),
    {
      id: "language",
      title: t({ zh: "切换语言", en: "Language" }),
      subtitle: locale === "zh"
        ? t({ zh: "当前默认语言：中文", en: "Current default language: Chinese" })
        : t({ zh: "当前默认语言：英文", en: "Current default language: English" }),
      detail: t({
        zh: "切换 City CLI 的默认语言，并保存到本地状态里。",
        en: "Switch the default City CLI language and persist it into local state.",
      }),
    },
    {
      id: "help",
      title: t({ zh: "查看帮助", en: "Show help" }),
      subtitle: t({ zh: "输出 `city --help`", en: "print `city --help`" }),
      detail: t({
        zh: "输出当前 City 根命令帮助，适合查阅脚本化子命令。",
        en: "Print the current City root help, useful when looking up scriptable subcommands.",
      }),
    },
    section_item("actions", t({ zh: "操作", en: "Actions" })),
    {
      id: "stop",
      title: t({ zh: "停止 City", en: "Stop City" }),
      subtitle: running
        ? t({ zh: "停止 City 与托管 agent", en: "stop City and managed agents" })
        : t({ zh: "当前 City 已停止", en: "City already stopped" }),
      detail: t({
        zh: "停止 City，并清理当前受管 agent daemon。",
        en: "Stop City and clean up currently managed agent daemons.",
      }),
    },
    {
      id: "restart",
      title: t({ zh: "重启 City", en: "Restart City" }),
      subtitle: t({
        zh: "重启 City 并恢复受管状态",
        en: "restart City and recover managed state",
      }),
      detail: t({
        zh: "重启 City，并尝试恢复此前托管的 agent 运行态。",
        en: "Restart City and try to recover previously managed agent state.",
      }),
    },
    {
      id: "exit",
      title: t({ zh: "退出", en: "Exit" }),
      subtitle: t({ zh: "关闭 City", en: "Close City" }),
      detail: t({
        zh: "退出当前 City CLI。",
        en: "Exit the current City CLI.",
      }),
    },
  ];

  return {
    title: `City v${version}`,
    subtitle: t({
      zh: `City：${runtime_state_text(running)} · City：${build_federation_subtitle(city_state)} · agent：${managed_agents}`,
      en: `City: ${runtime_state_text(running)} · City: ${build_federation_subtitle(city_state)} · agents: ${managed_agents}`,
    }),
    footer: t({
      zh: "Enter 进入动作 · Esc / q 退出 · ↑↓ 切换 · 当前入口：全屏 TUI",
      en: "Enter run action · Esc / q quit · ↑↓ navigate · current entry: full-screen TUI",
    }),
    items,
  };
}

async function run_city_dashboard_once(
  state: city_dashboard_state,
): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    const shell = create_city_dashboard_shell(state);
    const { screen } = shell;

    let finished = false;
    let selected_index = resolve_loop_selectable_index(state.items, 0, 0);

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
      keys: false,
      vi: false,
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
      selected_index = resolve_loop_selectable_index(
        state.items,
        index_value,
        selected_index,
      );
      if (list.selected !== selected_index) {
        list.select(selected_index);
      }
      const next_item = state.items[selected_index];
      if (!next_item) return;
      detail.setContent(format_detail_content(next_item));
      shell.footer_box.setContent(format_footer(state.footer, next_item));
      screen.render();
    };

    list.on("select item", (_item, index_value) => {
      sync_selection(index_value);
    });

    list.key(["up", "k"], () => {
      selected_index = resolve_next_loop_selectable_index(
        state.items,
        selected_index,
        -1,
      );
      list.select(selected_index);
      sync_selection(selected_index);
    });

    list.key(["down", "j"], () => {
      selected_index = resolve_next_loop_selectable_index(
        state.items,
        selected_index,
        1,
      );
      list.select(selected_index);
      sync_selection(selected_index);
    });

    list.key(["enter"], () => {
      sync_selection();
      if (is_disabled_item(state.items[selected_index])) {
        return;
      }
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

function create_city_dashboard_shell(state: city_dashboard_state): city_dashboard_shell {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "Downcity City",
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

function build_federation_subtitle(city_state: FederationMembershipState): string {
  if (city_state.has_user_token) {
    return t({
      zh: `${city_state.federation_url} · 已登录`,
      en: `${city_state.federation_url} · signed in`,
    });
  }

  return t({
    zh: `${city_state.federation_url} · 未登录`,
    en: `${city_state.federation_url} · not signed in`,
  });
}

function build_federation_detail(city_state: FederationMembershipState): string {
  return t({
    zh: [
      `{bold}当前 City 连接{/bold}`,
      `base：${city_state.federation_url}`,
      `source：${city_state.source}`,
      `city id：${city_state.city_id}`,
      `user token：${configured_state_text(city_state.has_user_token)}`,
      city_state.user_id ? `user id：${city_state.user_id}` : "",
      "",
      "选择后进入 `city federation` 交互管理器，继续 join / use / login / recharge 等流程。",
    ].filter(Boolean).join("\n"),
    en: [
      `{bold}Current City connection{/bold}`,
      `base: ${city_state.federation_url}`,
      `source: ${city_state.source}`,
      `city id: ${city_state.city_id}`,
      `user token: ${configured_state_text(city_state.has_user_token)}`,
      city_state.user_id ? `user id: ${city_state.user_id}` : "",
      "",
      "Selecting this opens the `city federation` interactive manager for join, use, login, recharge, and related flows.",
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

function section_item(id: string, title: string): tui_list_item {
  return {
    id: `section:${id}`,
    title,
    subtitle: "",
    detail: "",
    disabled: true,
  };
}

function format_list_label(item: tui_list_item): string {
  if (is_disabled_item(item)) {
    return `── ${item.title} ──`;
  }
  return item.title;
}

function format_detail_content(item: tui_list_item): string {
  if (is_disabled_item(item)) {
    return [
      `{bold}${item.title}{/bold}`,
      t({
        zh: "这是侧边栏分区标题，用于区分当前 City 管理区域。",
        en: "This is a sidebar section heading used to group City management areas.",
      }),
    ].join("\n");
  }
  return `{bold}${item.title}{/bold}\n${item.subtitle}\n\n${item.detail}`;
}

function format_footer(base_footer: string, item: tui_list_item | undefined): string {
  if (!item) return base_footer;
  if (is_disabled_item(item)) return base_footer;
  return `${base_footer} · ${item.subtitle}`;
}

function format_breadcrumb(value: string): string {
  return value.padEnd(80, " ");
}

function is_disabled_item(item: tui_list_item | undefined): boolean {
  return is_disabled_selectable_item(item);
}

function read_city_cli_version(): string {
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
