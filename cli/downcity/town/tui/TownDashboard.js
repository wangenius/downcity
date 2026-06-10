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
/**
 * 打开 Town 顶层仪表盘。
 */
export async function open_town_dashboard(options) {
    while (true) {
        const state = await build_town_dashboard_state();
        const selection = await run_town_dashboard_once(state);
        if (!selection) {
            return;
        }
        const result = await options.run_action(selection);
        if (result === "quit") {
            return;
        }
    }
}
async function build_town_dashboard_state() {
    const version = read_town_cli_version();
    const locale = getCliLocale();
    const pid = await readTownPid();
    const running = Boolean(pid && isTownProcessAlive(pid));
    const city_state = readTownCityConnectionState();
    const managed_agents = await safe_count_running_agents();
    const items = [
        section_item("runtime", t({ zh: "运行时", en: "Runtime" })),
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
        section_item("management", t({ zh: "管理", en: "Management" })),
        {
            id: "city",
            title: t({ zh: "City 连接", en: "City connection" }),
            subtitle: build_city_subtitle(city_state),
            detail: build_city_detail(city_state),
        },
        {
            id: "agent",
            title: t({ zh: "Agent 管理", en: "Agent management" }),
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
            title: t({ zh: "Plugin 能力", en: "Plugin capabilities" }),
            subtitle: t({
                zh: "查看 Agent 可用的 plugin 目录与能力边界",
                en: "inspect the plugin catalog and capability boundaries available to agents",
            }),
            detail: t({
                zh: "进入 Plugin 能力管理器。这里展示当前已注册的 plugin、actions、system 能力和运行边界；具体运行态仍归属于 Agent。",
                en: "Open the Plugin capability manager. It shows registered plugins, actions, system capabilities, and runtime boundaries; actual runtime still belongs to agents.",
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
        section_item("navigation", t({ zh: "导航", en: "Navigation" })),
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
async function run_town_dashboard_once(state) {
    return await new Promise((resolve) => {
        const shell = create_town_dashboard_shell(state);
        const { screen } = shell;
        let finished = false;
        let selected_index = resolve_selectable_index(state.items, 0, 0);
        const finish = (value) => {
            if (finished)
                return;
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
        const sync_selection = (index_value = list.selected) => {
            selected_index = resolve_selectable_index(state.items, index_value, selected_index);
            if (list.selected !== selected_index) {
                list.select(selected_index);
            }
            const next_item = state.items[selected_index];
            if (!next_item)
                return;
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
                if (finished)
                    return;
                sync_selection();
            });
        });
        list.key(["enter"], () => {
            sync_selection();
            if (is_disabled_item(state.items[selected_index])) {
                return;
            }
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
        list.focus();
        sync_selection(selected_index);
        screen.render();
    });
}
function create_town_dashboard_shell(state) {
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
async function safe_count_running_agents() {
    try {
        return (await resolveRunningManagedAgents({ syncRegistry: false })).length;
    }
    catch {
        return 0;
    }
}
function build_status_subtitle(running, managed_agents) {
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
function build_status_detail(params) {
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
function build_city_subtitle(city_state) {
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
function build_city_detail(city_state) {
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
function runtime_state_text(running) {
    return running
        ? t({ zh: "运行中", en: "running" })
        : t({ zh: "已停止", en: "stopped" });
}
/**
 * 配置状态显示文案。
 */
function configured_state_text(configured) {
    return configured
        ? t({ zh: "已配置", en: "configured" })
        : t({ zh: "缺失", en: "missing" });
}
/**
 * 未知值显示文案。
 */
function unknown_text() {
    return t({ zh: "未知", en: "unknown" });
}
function section_item(id, title) {
    return {
        id: `section:${id}`,
        title,
        subtitle: "",
        detail: "",
        disabled: true,
    };
}
function format_list_label(item) {
    if (is_disabled_item(item)) {
        return `── ${item.title} ──`;
    }
    return item.title;
}
function format_detail_content(item) {
    if (is_disabled_item(item)) {
        return [
            `{bold}${item.title}{/bold}`,
            t({
                zh: "这是侧边栏分区标题，用于区分当前 Town 管理区域。",
                en: "This is a sidebar section heading used to group Town management areas.",
            }),
        ].join("\n");
    }
    return `{bold}${item.title}{/bold}\n${item.subtitle}\n\n${item.detail}`;
}
function format_footer(base_footer, item) {
    if (!item)
        return base_footer;
    if (is_disabled_item(item))
        return base_footer;
    return `${base_footer} · ${item.subtitle}`;
}
function format_breadcrumb(value) {
    return value.padEnd(80, " ");
}
function clamp_selected_index(value, length, fallback) {
    if (length <= 0)
        return 0;
    const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
    return Math.max(0, Math.min(length - 1, index));
}
function is_disabled_item(item) {
    return item?.disabled === true;
}
function resolve_selectable_index(items, value, fallback) {
    if (items.length <= 0)
        return 0;
    const candidate = clamp_selected_index(value, items.length, fallback);
    if (!is_disabled_item(items[candidate])) {
        return candidate;
    }
    const direction = candidate >= fallback ? 1 : -1;
    const first_try = find_selectable_index(items, candidate, direction);
    if (first_try !== -1)
        return first_try;
    const second_try = find_selectable_index(items, candidate, direction * -1);
    if (second_try !== -1)
        return second_try;
    return candidate;
}
function find_selectable_index(items, start_index, direction) {
    let index = start_index;
    while (index >= 0 && index < items.length) {
        if (!is_disabled_item(items[index])) {
            return index;
        }
        index += direction;
    }
    return -1;
}
function read_town_cli_version() {
    try {
        const package_json_path = new URL("../../package.json", import.meta.url);
        const package_json = JSON.parse(readFileSync(package_json_path, "utf8"));
        return String(package_json.version ?? "unknown");
    }
    catch {
        return "unknown";
    }
}
//# sourceMappingURL=TownDashboard.js.map