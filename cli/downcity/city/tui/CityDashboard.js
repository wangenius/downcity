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
    if (!active_server) {
        const items = [
            {
                id: "connect_city",
                title: t({ zh: "连接现有 City", en: "Connect an existing City" }),
                subtitle: t({ zh: "添加一个 City base URL", en: "Add a City base URL" }),
                detail: t({
                    zh: "连接并保存一个 City base。连接成功后会自动进入当前 City 的管理工作区。",
                    en: "Connect and save a City base. After success, City opens the current management workspace.",
                }),
            },
            {
                id: "set_language",
                title: t({ zh: "切换语言", en: "Language" }),
                subtitle: locale === "zh"
                    ? t({ zh: "当前默认语言：中文", en: "Current default language: Chinese" })
                    : t({ zh: "当前默认语言：英文", en: "Current default language: English" }),
                detail: t({
                    zh: "切换 City CLI 的默认语言，并保存到本地配置。",
                    en: "Switch the default City CLI language and persist it locally.",
                }),
            },
            {
                id: "update",
                title: t({ zh: "升级 CLI", en: "Upgrade CLI" }),
                subtitle: t({ zh: "刷新全局 city 命令", en: "Refresh the global city command" }),
                detail: t({
                    zh: "拉起当前安装的 CLI 自更新流程。完成后请重新运行 `city`。",
                    en: "Run the self-update flow for the installed CLI. Restart `city` after completion.",
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
                zh: "欢迎使用 City。当前尚未连接任何 City server。",
                en: "Welcome to City. No City server is connected yet.",
            }),
            footer: t({
                zh: "Enter 进入 · Esc / q 退出 · ↑↓ 切换 · 当前入口：全屏 TUI",
                en: "Enter open · Esc / q quit · ↑↓ navigate · current entry: full-screen TUI",
            }),
            items,
        };
    }
    const admin_state = String(active_server.admin_secret_key || "").trim()
        ? t({ zh: "已配置 admin", en: "admin configured" })
        : t({ zh: "未配置 admin", en: "admin missing" });
    const items = [
        {
            id: "open_current",
            title: t({ zh: "打开当前 City", en: "Open current City" }),
            subtitle: `${active_server.name} · ${admin_state}`,
            detail: t({
                zh: `当前 City：${active_server.base_url}\n\n进入当前 City 的管理工作区，继续 server management / admin tools 等流程。`,
                en: `Current City: ${active_server.base_url}\n\nOpen the current City management workspace and continue into server management or admin tools.`,
            }),
        },
        {
            id: "switch_city",
            title: t({ zh: "切换 City", en: "Switch City" }),
            subtitle: t({
                zh: `已连接 ${connected_count} 个 City`,
                en: `${connected_count} connected City servers`,
            }),
            detail: t({
                zh: "从已连接的 City 列表中切换当前工作区。",
                en: "Switch the current workspace from the saved City list.",
            }),
        },
        {
            id: "connect_city",
            title: t({ zh: "连接另一个 City", en: "Connect another City" }),
            subtitle: t({ zh: "添加新的 City server", en: "Add another City server" }),
            detail: t({
                zh: "新增一个 City base URL，并保存到本地配置中。",
                en: "Add another City base URL and save it into the local configuration.",
            }),
        },
        {
            id: "set_language",
            title: t({ zh: "切换语言", en: "Language" }),
            subtitle: locale === "zh"
                ? t({ zh: "当前默认语言：中文", en: "Current default language: Chinese" })
                : t({ zh: "当前默认语言：英文", en: "Current default language: English" }),
            detail: t({
                zh: "切换 City CLI 的默认语言，并保存到本地配置。",
                en: "Switch the default City CLI language and persist it locally.",
            }),
        },
        {
            id: "update",
            title: t({ zh: "升级 CLI", en: "Upgrade CLI" }),
            subtitle: t({ zh: "刷新全局 city 命令", en: "Refresh the global city command" }),
            detail: t({
                zh: "拉起当前安装的 CLI 自更新流程。完成后请重新运行 `city`。",
                en: "Run the self-update flow for the installed CLI. Restart `city` after completion.",
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
        mode: "home",
        title: `City v${version}`,
        subtitle: t({
            zh: `当前 City：${active_server.name} · ${active_server.base_url}`,
            en: `Current City: ${active_server.name} · ${active_server.base_url}`,
        }),
        footer: t({
            zh: "Enter 进入动作 · Esc / q 退出 · ↑↓ 切换 · 当前入口：全屏 TUI",
            en: "Enter run action · Esc / q quit · ↑↓ navigate · current entry: full-screen TUI",
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