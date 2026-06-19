/**
 * Federation 顶层全屏 TUI 仪表盘。
 *
 * 关键说明（中文）
 * - 这是 `downfed` / `downfed manage` 的默认交互入口。
 * - 左侧 sidebar 承载 Federation 操作菜单，右侧 main_section 展示当前项详情。
 */

import blessed from "neo-blessed";
import { readFileSync } from "node:fs";
import { create_tui_shell } from "./Shell.js";
import { getCliLocale, t } from "../../shared/CliLocale.js";
import type { FederationAction } from "../types/Interactive.js";
import type { tui_action_result, tui_list_item } from "../types/Tui.js";

interface federation_dashboard_options {
  /** 执行 Federation 仪表盘动作。 */
  run_action: (action: FederationAction) => Promise<tui_action_result>;
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

/**
 * 打开 Federation 顶层仪表盘。
 */
export async function open_federation_dashboard(
  options: federation_dashboard_options,
): Promise<void> {
  while (true) {
    const state = build_federation_dashboard_state();
    const selection = await run_federation_dashboard_once(state);
    if (!selection) {
      return;
    }

    const result = await options.run_action(selection as FederationAction);

    if (result === "quit") {
      return;
    }
  }
}

interface federation_dashboard_state {
  title: string;
  subtitle: string;
  footer: string;
  items: tui_list_item[];
}

function build_federation_dashboard_state(): federation_dashboard_state {
  const version = read_federation_cli_version();

  const items: tui_list_item[] = [
    {
      id: "create_federation",
      title: t({ zh: "创建 Federation", en: "Create Federation" }),
      subtitle: t({ zh: "交互式创建 Federation 项目骨架", en: "Interactively scaffold a Federation project" }),
      detail: t({
        zh: "在当前目录创建 Federation 项目骨架，包含 Wrangler 配置和示例代码。",
        en: "Create a Federation project scaffold in the current directory, including Wrangler config and sample code.",
      }),
    },
    {
      id: "deploy_federation",
      title: t({ zh: "部署 Federation", en: "Deploy Federation" }),
      subtitle: t({ zh: "部署当前目录的 Federation 项目", en: "Deploy the Federation project in the current directory" }),
      detail: t({
        zh: "构建并部署当前目录中的 Federation 项目到 Cloudflare Workers。",
        en: "Build and deploy the Federation project in the current directory to Cloudflare Workers.",
      }),
    },
    {
      id: "refresh_env",
      title: t({ zh: "刷新 env cache", en: "Refresh env cache" }),
      subtitle: t({ zh: "刷新 Federation runtime env cache", en: "Refresh the Federation runtime env cache" }),
      detail: t({
        zh: "刷新当前 Federation 的运行时环境变量缓存。",
        en: "Refresh the runtime environment variable cache for the current Federation.",
      }),
    },
    {
      id: "more",
      title: t({ zh: "更多", en: "More" }),
      subtitle: t({ zh: "语言、升级等设置", en: "Language, upgrade, and more" }),
      detail: t({
        zh: "进入更多操作，查看语言切换和 CLI 升级等设置。",
        en: "Open more actions for language switching and CLI upgrade settings.",
      }),
    },
    {
      id: "quit",
      title: t({ zh: "退出", en: "Exit" }),
      subtitle: t({ zh: "关闭 downfed", en: "Close downfed" }),
      detail: t({
        zh: "退出当前 downfed TUI。",
        en: "Exit the current downfed TUI.",
      }),
    },
  ];

  return {
    title: `Downcity Federation v${version}`,
    subtitle: t({
      zh: "选择一项 Federation 管理操作",
      en: "Choose a Federation management action",
    }),
    footer: t({
      zh: "Enter 进入 · Esc / q 退出 · ↑↓ 切换",
      en: "Enter open · Esc / q quit · ↑↓ navigate",
    }),
    items,
  };
}

async function run_federation_dashboard_once(
  state: federation_dashboard_state,
): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    const shell = create_tui_shell({
      screen_title: "Downcity Federation",
      breadcrumb: state.title,
      footer: state.footer,
    });
    const { screen } = shell;

    let finished = false;
    let raw_input_listener: ((chunk: Buffer | string) => void) | undefined;
    let selected_index = 0;

    const finish = (value: string | null): void => {
      if (finished) return;
      finished = true;
      if (raw_input_listener) {
        process.stdin.off("data", raw_input_listener);
      }
      screen.destroy();
      resolve(value);
    };

    blessed.box({
      parent: shell.main_box,
      top: 0,
      left: 1,
      width: "100%-2",
      height: 3,
      tags: true,
      content: `{bold}${state.title}{/bold}\n${state.subtitle}`,
    });

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
          bg: "cyan",
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
      shell.set_footer(format_footer(state.footer, next_item));
      screen.render();
    };

    list.on("select item", (_item, index_value) => {
      sync_selection(index_value);
    });

    list.on("keypress", () => {
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
    raw_input_listener = (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (text.includes("\u0003") || text === "\u001b") {
        finish(null);
        return;
      }
      if (text.includes("\r") || text.includes("\n")) {
        finish(state.items[selected_index]?.id ?? null);
      }
    };
    process.stdin.on("data", raw_input_listener);

    list.focus();
    sync_selection(selected_index);
    screen.render();
  });
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

function clamp_selected_index(
  value: unknown,
  length: number,
  fallback: number,
): number {
  if (length <= 0) return 0;
  const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
  return Math.max(0, Math.min(length - 1, index));
}

function read_federation_cli_version(): string {
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
