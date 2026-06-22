/**
 * Federation 顶层 TUI 仪表盘。
 *
 * 关键说明（中文）
 * - 这是 `downfed` / `downfed manage` 的默认交互入口。
 * - 首页直接展示已保存的 Federation 列表，选中后进入对应 admin 工作区。
 * - 内部使用 shared pi-tui runtime，和其它 CLI TUI 保持同一套框架。
 */

import { readFileSync } from "node:fs";
import { readConfig } from "@/federation/core/session.js";
import { ManagedTuiRuntime } from "@/shared/tui/ManagedTuiRuntime.js";
import { t } from "@/shared/CliLocale.js";
import type { FederationAction } from "@/federation/types/Interactive.js";
import type { tui_action_result, tui_list_item } from "@/federation/types/Tui.js";

interface federation_dashboard_options {
  /** 执行 Federation 仪表盘动作。 */
  run_action: (action: FederationAction) => Promise<tui_action_result>;
}

/**
 * 打开 Federation 顶层仪表盘。
 */
export async function open_federation_dashboard(
  options: federation_dashboard_options,
): Promise<void> {
  const runtime = new ManagedTuiRuntime({ title: "Downcity Federation" });
  try {
    while (true) {
      const state = build_federation_dashboard_state();
      const selection = await runtime.dashboard(state);
      if (!selection) {
        return;
      }

      const result = await options.run_action(selection as FederationAction);

      if (result === "quit") {
        return;
      }
    }
  } finally {
    runtime.close();
  }
}

interface federation_dashboard_state {
  /** dashboard 顶部标题。 */
  title: string;
  /** dashboard 顶部副标题。 */
  subtitle: string;
  /** dashboard 底部帮助文案。 */
  footer: string;
  /** dashboard 列表项。 */
  items: tui_list_item[];
}

function build_federation_dashboard_state(): federation_dashboard_state {
  const version = read_federation_cli_version();
  const config = readConfig();
  const federation_items = config.servers.map((server) => ({
    id: `open_federation:${server.base_url}`,
    title: server.base_url === config.active_server_url ? `★ ${server.name}` : server.name,
    subtitle: server.admin_secret_key
      ? t({ zh: "admin 已配置", en: "admin configured" })
      : t({ zh: "admin 未配置", en: "admin missing" }),
    detail: t({
      zh: `打开 ${server.name} 的 admin 管理工作区。\n\nURL: ${server.base_url}\nadmin: ${server.admin_secret_key ? "已配置" : "未配置"}`,
      en: `Open the admin workspace for ${server.name}.\n\nURL: ${server.base_url}\nadmin: ${server.admin_secret_key ? "configured" : "missing"}`,
    }),
  }));

  const items: tui_list_item[] = [
    ...federation_items,
    {
      id: "add_federation",
      title: federation_items.length === 0
        ? t({ zh: "添加第一个 Federation", en: "Add First Federation" })
        : t({ zh: "添加 Federation", en: "Add Federation" }),
      subtitle: t({ zh: "配置已部署 Federation URL", en: "Configure a deployed Federation URL" }),
      detail: federation_items.length === 0
        ? t({
          zh: "当前没有已保存的 Federation。先添加一个已经部署好的 Federation 入口地址。",
          en: "No Federation is saved yet. Add the URL of an already deployed Federation first.",
        })
        : t({
          zh: "保存一个已经部署好的 Federation 入口地址。保存后会出现在首页列表中，点击即可进入管理。",
          en: "Save the URL of an already deployed Federation. It will appear in the home list, where selecting it opens management.",
        }),
    },
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
      zh: config.servers.length > 0
        ? "选择一个 Federation 进入管理"
        : "先添加一个已部署 Federation，或创建/部署新 Federation",
      en: config.servers.length > 0
        ? "Choose a Federation to manage"
        : "Add a deployed Federation first, or create/deploy a new Federation",
    }),
    footer: t({
      zh: "Enter 进入 · Esc / q 退出 · ↑↓ 切换",
      en: "Enter open · Esc / q quit · ↑↓ navigate",
    }),
    items,
  };
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
