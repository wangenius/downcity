/**
 * City 顶层全屏 TUI 仪表盘。
 *
 * 关键说明（中文）
 * - 这是 `city` / `city manage` 的默认交互入口。
 * - 左侧 sidebar 承载 City 列表与 breadcrumb，右侧 main_section 展示当前项详情。
 */
import blessed from "neo-blessed";
import { readFileSync } from "node:fs";
import { create_city_tui_shell } from "./Shell.js";
import { readActiveServer, readConfig } from "../core/session.js";
import { getCliLocale, t } from "../i18n.js";
/**
 * 打开 City 顶层仪表盘。
 */
export async function open_city_dashboard(options) {
    while (true) {
        const state = build_city_dashboard_state();
        const selection = await run_city_dashboard_once(state);
        if (!selection) {
            return;
        }
        const result = state.mode === "welcome"
            ? await options.run_welcome_action(selection)
            : await options.run_home_action(selection);
        if (result === "quit") {
            return;
        }
    }
}
function build_city_dashboard_state() {
    const locale = getCliLocale();
    const version = read_city_cli_version();
    const active_server = readActiveServer();
    const config = readConfig();
    const connected_count = config.servers.length;
    if (connected_count === 0) {
        const items = [
            {
                id: "connect_city",
                title: t({ zh: "添加 City", en: "Add City" }),
                subtitle: t({ zh: "添加一个 City base URL", en: "Add a City base URL" }),
                detail: t({
                    zh: "添加并保存一个 City base。连接成功后会自动进入这个 City 的管理工作区。",
                    en: "Add and save a City base. After success, City opens this management workspace.",
                }),
            },
            {
                id: "more",
                title: t({ zh: "更多", en: "More" }),
                subtitle: locale === "zh"
                    ? t({ zh: "语言、升级等设置", en: "Language, upgrade, and more" })
                    : t({ zh: "语言、升级等设置", en: "Language, upgrade, and more" }),
                detail: t({
                    zh: "进入更多操作，查看语言切换和 CLI 升级等设置。",
                    en: "Open more actions for language switching and CLI upgrade settings.",
                }),
            },
            {
                id: "quit",
                title: t({ zh: "退出", en: "Exit" }),
                subtitle: t({ zh: "关闭 City", en: "Close City" }),
                detail: t({
                    zh: "退出当前 City CLI。",
                    en: "Exit the current City CLI.",
                }),
            },
        ];
        return {
            mode: "welcome",
            title: `City v${version}`,
            subtitle: t({
                zh: "当前还没有 City。先添加一个再进入管理。",
                en: "No City has been added yet. Add one to start managing it.",
            }),
            footer: t({
                zh: "Enter 进入 · Esc / q 退出 · ↑↓ 切换",
                en: "Enter open · Esc / q quit · ↑↓ navigate",
            }),
            items,
        };
    }
    const items = config.servers.map((server) => {
        const is_active = active_server?.base_url === server.base_url;
        const admin_state = String(server.admin_secret_key || "").trim()
            ? t({ zh: "已配置 admin", en: "admin configured" })
            : t({ zh: "未配置 admin", en: "admin missing" });
        return {
            id: `open_server:${server.base_url}`,
            title: is_active ? `★ ${server.name}` : server.name,
            subtitle: `${server.base_url} · ${admin_state}`,
            detail: t({
                zh: `City：${server.name}\nURL：${server.base_url}\n状态：${admin_state}${is_active ? "\n\n当前已激活。" : ""}\n\n回车直接进入这个 City 的管理工作区。`,
                en: `City: ${server.name}\nURL: ${server.base_url}\nStatus: ${admin_state}${is_active ? "\n\nCurrently active." : ""}\n\nPress Enter to open this City management workspace.`,
            }),
        };
    });
    items.push({
        id: "connect_city",
        title: t({ zh: "添加 City", en: "Add City" }),
        subtitle: t({
            zh: `当前已连接 ${connected_count} 个 City`,
            en: `${connected_count} connected City servers`,
        }),
        detail: t({
            zh: "添加新的 City base URL，并保存到本地配置中。",
            en: "Add a new City base URL and save it into the local configuration.",
        }),
    }, {
        id: "more",
        title: t({ zh: "更多", en: "More" }),
        subtitle: locale === "zh"
            ? t({ zh: "语言、升级等设置", en: "Language, upgrade, and more" })
            : t({ zh: "语言、升级等设置", en: "Language, upgrade, and more" }),
        detail: t({
            zh: "进入更多操作，查看语言切换和 CLI 升级等设置。",
            en: "Open more actions for language switching and CLI upgrade settings.",
        }),
    }, {
        id: "quit",
        title: t({ zh: "退出", en: "Exit" }),
        subtitle: t({ zh: "关闭 City", en: "Close City" }),
        detail: t({
            zh: "退出当前 City CLI。",
            en: "Exit the current City CLI.",
        }),
    });
    return {
        mode: "servers",
        title: `City v${version}`,
        subtitle: t({
            zh: `共 ${connected_count} 个 City${active_server ? ` · 当前：${active_server.name}` : ""}`,
            en: `${connected_count} City servers${active_server ? ` · current: ${active_server.name}` : ""}`,
        }),
        footer: t({
            zh: "Enter 进入 City · Esc / q 退出 · ↑↓ 切换",
            en: "Enter open City · Esc / q quit · ↑↓ navigate",
        }),
        items,
    };
}
async function run_city_dashboard_once(state) {
    return await new Promise((resolve) => {
        const shell = create_city_tui_shell({
            screen_title: "Downcity City",
            breadcrumb: state.title,
            footer: state.footer,
        });
        const { screen } = shell;
        let finished = false;
        let raw_input_listener;
        let selected_index = 0;
        const finish = (value) => {
            if (finished)
                return;
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
        });
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
        list.on("select item", (_item, index_value) => {
            selected_index = clamp_selected_index(index_value, state.items.length, selected_index);
            const next_item = state.items[selected_index];
            if (!next_item)
                return;
            detail.setContent(format_detail_content(next_item));
            shell.set_footer(format_footer(state.footer, next_item));
            screen.render();
        });
        list.key(["enter"], () => {
            finish(state.items[selected_index]?.id ?? null);
        });
        detail.key(["pageup"], () => {
            detail.scroll(-Math.max(1, Math.floor(detail.height / 2)));
            screen.render();
        });
        detail.key(["pagedown"], () => {
            detail.scroll(Math.max(1, Math.floor(detail.height / 2)));
            screen.render();
        });
        screen.key(["escape", "q", "C-c"], () => finish(null));
        raw_input_listener = (chunk) => {
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
        shell.set_footer(format_footer(state.footer, state.items[selected_index]));
        screen.render();
    });
}
function format_list_label(item) {
    return `${item.title}  ·  ${item.subtitle}`;
}
function format_detail_content(item) {
    return `{bold}${item.title}{/bold}\n${item.subtitle}\n\n${item.detail}`;
}
function format_footer(base_footer, item) {
    if (!item)
        return base_footer;
    return `${base_footer} · ${item.subtitle}`;
}
function clamp_selected_index(value, length, fallback) {
    if (length <= 0)
        return 0;
    const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
    return Math.max(0, Math.min(length - 1, index));
}
function read_city_cli_version() {
    try {
        const package_json_path = new URL("../../package.json", import.meta.url);
        const package_json = JSON.parse(readFileSync(package_json_path, "utf8"));
        return String(package_json.version ?? "unknown");
    }
    catch {
        return "unknown";
    }
}
//# sourceMappingURL=CityDashboard.js.map