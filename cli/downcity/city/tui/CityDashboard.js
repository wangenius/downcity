/**
 * City 顶层全屏 TUI 仪表盘。
 *
 * 关键说明（中文）
 * - 这是 `city` / `city manage` 的默认交互入口。
 * - 进入具体动作前会销毁 TUI 屏幕，再复用现有 prompts/clack 流程。
 * - 动作结束后重新回到 TUI，保证迭代速度与既有功能兼容。
 */
import blessed from "neo-blessed";
import { readFileSync } from "node:fs";
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
        const screen = blessed.screen({
            smartCSR: true,
            fullUnicode: true,
            title: "Downcity City",
            dockBorders: true,
            autoPadding: true,
        });
        let finished = false;
        const finish = (value) => {
            if (finished)
                return;
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
                border: { fg: "cyan" },
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
                border: { fg: "cyan" },
                item: { fg: "white" },
                selected: {
                    fg: "black",
                    bg: "green",
                    bold: true,
                },
            },
            items: state.items.map(format_list_label),
        });
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
                border: { fg: "cyan" },
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
                border: { fg: "cyan" },
                fg: "gray",
            },
            content: state.footer,
        });
        list.on("select item", (_item, index_value) => {
            const index = typeof index_value === "number" ? index_value : 0;
            const next_item = state.items[index];
            if (!next_item)
                return;
            detail.setContent(format_detail_content(next_item));
            screen.render();
        });
        list.key(["enter"], () => {
            const index = typeof list.selected === "number" ? list.selected : 0;
            finish(state.items[index]?.id ?? null);
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
        list.focus();
        screen.render();
    });
}
function format_list_label(item) {
    return `${item.title}\n${item.subtitle}`;
}
function format_detail_content(item) {
    return `{bold}${item.title}{/bold}\n${item.subtitle}\n\n${item.detail}`;
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