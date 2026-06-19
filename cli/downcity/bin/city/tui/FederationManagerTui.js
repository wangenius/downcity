/**
 * City City 连接持久化全屏 TUI。
 *
 * 关键点（中文）
 * - 裸 `city city` 使用这个界面，所有状态、loading 和结果都保留在 TUI 右侧。
 * - `city federation status/list/whoami/...` 子命令仍由 shared/FederationConnection 负责 stdout 输出。
 * - 需要输入的动作会临时进入现有 prompt TUI，完成后回到本界面并展示结果。
 */
import blessed from "neo-blessed";
import { DEFAULT_FEDERATION_URL, DEFAULT_CITY_ID, list_federations, normalizeCityUrl, read_current_city_session, readPersistedCityCliLocale, readCityState, readCityString, resolve_selected_federation_url, upsert_federation_profile, writeCityState, } from "../shared/CityStateStore.js";
import { performCityUserLogin } from "../shared/CityUserLogin.js";
import { CityUserManager } from "../shared/CityUserManager.js";
import { readCurrentCityBalance, rechargeCurrentCityUser, } from "../shared/CityBalance.js";
import { promptAndPersistCityCliLocale } from "../shared/InteractiveLocale.js";
import { getCliLocale, t } from "../../shared/CliLocale.js";
import prompts from "./Prompts.js";
import { is_disabled_selectable_item, resolve_loop_selectable_index, resolve_next_loop_selectable_index, } from "./SelectableList.js";
const cityUserManager = new CityUserManager();
function read_federation_membership_state() {
    const state = readCityState();
    const federation_url = resolve_selected_federation_url(state);
    const session = state.sessions?.[federation_url] ?? null;
    if (session?.user_token) {
        return {
            federation_url,
            city_id: session.city_id || DEFAULT_CITY_ID,
            has_user_token: true,
            source: "city-session",
            user_id: session.user_id,
            user_label: session.user_label,
        };
    }
    const server = list_federations().find((item) => item.federation_url === federation_url);
    return {
        federation_url,
        city_id: DEFAULT_CITY_ID,
        has_user_token: false,
        source: server?.source === "city-admin"
            ? "city-admin"
            : server?.source === "city"
                ? "city-base"
                : "default",
    };
}
function save_city_user_session(session) {
    const state = upsert_federation_profile(readCityState(), {
        federation_url: session.federation_url,
    });
    const sessions = {
        ...(state.sessions ?? {}),
        [session.federation_url]: session,
    };
    writeCityState({
        ...state,
        selected_federation_url: session.federation_url,
        sessions,
    });
}
/**
 * 打开 City 连接管理 TUI。
 */
export async function open_city_manager_tui() {
    let next_state_params;
    while (true) {
        const initial_state = await build_city_manager_state(next_state_params);
        const prompt_action = await run_city_manager_screen(initial_state);
        if (!prompt_action)
            return;
        next_state_params = await handle_city_prompt_action(prompt_action);
    }
}
async function run_city_manager_screen(initial_state) {
    return await new Promise((resolve) => {
        const shell = create_city_manager_shell(initial_state);
        const runtime = {
            finished: false,
            selected_index: initial_state.initial_action
                ? find_action_index(initial_state.items, initial_state.initial_action)
                : resolve_loop_selectable_index(initial_state.items, 0, 0),
            state: initial_state,
        };
        const finish = (value) => {
            if (runtime.finished)
                return;
            runtime.finished = true;
            shell.screen.destroy();
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
            items: runtime.state.items.map(format_city_item_label),
        });
        const render = () => {
            const item = runtime.state.items[runtime.selected_index];
            list.setItems(runtime.state.items.map(format_city_item_label));
            list.select(runtime.selected_index);
            shell.header_box.setContent(format_header(runtime.state));
            shell.detail_box.setContent(runtime.state.detail_override ?? format_city_detail(item));
            shell.footer_box.setContent(format_footer(item));
            shell.screen.render();
        };
        const refresh_state = async (params) => {
            const next_state = await build_city_manager_state({
                detail_override: params?.detail_override,
                last_message: params?.last_message,
            });
            runtime.state = next_state;
            if (params?.keep_action) {
                runtime.selected_index = find_action_index(next_state.items, params.keep_action);
            }
            else {
                runtime.selected_index = resolve_loop_selectable_index(next_state.items, runtime.selected_index, 0);
            }
            render();
        };
        const set_detail = (content) => {
            runtime.state = {
                ...runtime.state,
                detail_override: content,
            };
            render();
        };
        const sync_selection = (index_value = list.selected) => {
            runtime.selected_index = resolve_loop_selectable_index(runtime.state.items, index_value, runtime.selected_index);
            runtime.state = {
                ...runtime.state,
                detail_override: undefined,
            };
            render();
        };
        const run_action = async () => {
            sync_selection();
            const item = runtime.state.items[runtime.selected_index];
            if (is_disabled_item(item))
                return;
            const action = item?.id;
            if (!action)
                return;
            if (action === "exit") {
                finish(null);
                return;
            }
            if (is_prompt_action(action)) {
                finish(action);
                return;
            }
            await handle_city_action({
                action,
                set_detail,
                refresh_state,
            });
        };
        list.on("select item", (_item, index_value) => {
            sync_selection(index_value);
        });
        list.key(["up", "k"], () => {
            runtime.selected_index = resolve_next_loop_selectable_index(runtime.state.items, runtime.selected_index, -1);
            sync_selection(runtime.selected_index);
        });
        list.key(["down", "j"], () => {
            runtime.selected_index = resolve_next_loop_selectable_index(runtime.state.items, runtime.selected_index, 1);
            sync_selection(runtime.selected_index);
        });
        list.key(["enter"], () => {
            void run_action();
        });
        shell.detail_box.key(["pageup"], () => {
            shell.detail_box.scroll(-Math.max(1, Math.floor(shell.detail_box.height / 2)));
            shell.screen.render();
        });
        shell.detail_box.key(["pagedown"], () => {
            shell.detail_box.scroll(Math.max(1, Math.floor(shell.detail_box.height / 2)));
            shell.screen.render();
        });
        shell.screen.key(["escape", "q", "C-c"], () => finish(null));
        list.focus();
        render();
    });
}
async function build_city_manager_state(params) {
    const membership = read_federation_membership_state();
    const balance_result = membership.has_user_token
        ? await read_balance_summary()
        : { account: null, error: undefined };
    const items = build_city_items({
        membership,
        balance: balance_result.account,
        balance_error: balance_result.error,
    });
    return {
        items,
        membership,
        balance: balance_result.account,
        balance_error: balance_result.error,
        detail_override: params?.detail_override,
        last_message: params?.last_message,
        initial_action: params?.initial_action,
        subtitle: build_city_subtitle(membership, balance_result.account),
    };
}
async function read_balance_summary() {
    try {
        return {
            account: await readCurrentCityBalance(),
        };
    }
    catch (error) {
        return {
            account: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function build_city_items(params) {
    const items = [
        section_item("status", t({ zh: "状态", en: "Status" })),
        {
            id: "status",
            title: t({ zh: "查看成员资格状态", en: "View membership status" }),
            subtitle: params.membership.federation_url,
            detail: format_membership_detail(params.membership),
        },
        section_item("city", "City"),
        {
            id: "use",
            title: t({ zh: "选择 Federation", en: "Select Federation" }),
            subtitle: t({
                zh: "从 City 本地 / downfed admin / 默认候选中选择",
                en: "Choose from City-local, downfed-admin, or default candidates",
            }),
            detail: format_federation_list_detail(list_federations()),
        },
        {
            id: "connect",
            title: t({ zh: "加入 Federation", en: "Join Federation" }),
            subtitle: t({
                zh: "手动写入一个 City 可用的 City",
                en: "Manually join a Federation",
            }),
            detail: t({
                zh: "输入 City URL 后会保存到 City 本地，并设为当前 City。",
                en: "Enter a Federation URL to save it locally and make it the current Federation.",
            }),
        },
        {
            id: "list",
            title: t({ zh: "查看可用 Federation", en: "List Federations" }),
            subtitle: t({
                zh: `${list_federations().length} 个可用 Federation`,
                en: `${list_federations().length} available Federations`,
            }),
            detail: format_federation_list_detail(list_federations()),
        },
        section_item("account", t({ zh: "账号", en: "Account" })),
    ];
    if (!params.membership.has_user_token) {
        items.push({
            id: "login",
            title: t({ zh: "登录", en: "Sign in" }),
            subtitle: t({
                zh: "登录当前 Federation",
                en: "Sign in to the current Federation",
            }),
            detail: format_login_detail(params.membership),
        });
    }
    else {
        items.push({
            id: "whoami",
            title: t({ zh: "当前账号", en: "Current account" }),
            subtitle: params.membership.user_label || params.membership.user_id || params.membership.city_id,
            detail: format_membership_detail(params.membership),
        }, {
            id: "balance",
            title: params.balance
                ? t({
                    zh: `余额：${params.balance.balance}`,
                    en: `Balance: ${params.balance.balance}`,
                })
                : t({ zh: "余额：暂不可用", en: "Balance: unavailable" }),
            subtitle: params.balance
                ? t({
                    zh: `更新：${params.balance.updated_at}`,
                    en: `Updated: ${params.balance.updated_at}`,
                })
                : params.balance_error ?? "",
            detail: params.balance
                ? format_balance_detail(params.balance)
                : format_error_detail(t({ zh: "余额暂不可用", en: "Balance unavailable" }), params.balance_error),
            disabled: true,
        }, {
            id: "recharge",
            title: t({ zh: "充值", en: "Recharge" }),
            subtitle: t({
                zh: "给当前账号发起 checkout 充值",
                en: "Start a checkout recharge for the current account",
            }),
            detail: t({
                zh: "输入金额和说明后，City 会创建充值单和 checkout 页面。",
                en: "Enter an amount and note; City will create a topup and checkout page.",
            }),
        }, {
            id: "logout",
            title: t({ zh: "登出", en: "Sign out" }),
            subtitle: t({
                zh: "清除当前 City 的 Federation 登录态",
                en: "Clear the City session for the current City",
            }),
            detail: t({
                zh: "只清除 City 本地保存的当前 Federation 登录态，不删除 City 账号。",
                en: "Only clears City's local session for the current City; it does not delete the City account.",
            }),
        });
    }
    items.push(section_item("settings", t({ zh: "设置", en: "Settings" })), {
        id: "language",
        title: t({ zh: "切换语言", en: "Language" }),
        subtitle: format_locale_description(readPersistedCityCliLocale() ?? getCliLocale()),
        detail: t({
            zh: "切换 City CLI 的默认语言，并保存到本地。",
            en: "Switch the default City CLI language and persist it locally.",
        }),
    }, section_item("navigation", t({ zh: "导航", en: "Navigation" })), {
        id: "exit",
        title: t({ zh: "退出", en: "Exit" }),
        subtitle: t({ zh: "关闭 City 连接管理", en: "Close City membership management" }),
        detail: t({
            zh: "退出当前 Federation管理 TUI。",
            en: "Exit the current City membership TUI.",
        }),
    });
    return items;
}
async function handle_city_action(params) {
    if (params.action === "status") {
        const state = read_federation_membership_state();
        await params.refresh_state({
            keep_action: "status",
            detail_override: format_membership_detail(state),
        });
        return;
    }
    if (params.action === "list") {
        await params.refresh_state({
            keep_action: "list",
            detail_override: format_federation_list_detail(list_federations()),
        });
        return;
    }
    if (params.action === "whoami") {
        params.set_detail(loading_text(t({ zh: "正在读取当前账号", en: "Reading current account" })));
        try {
            const user = await cityUserManager.resolveCurrentUser();
            await params.refresh_state({
                keep_action: "whoami",
                detail_override: format_current_user_detail(user),
            });
        }
        catch (error) {
            await params.refresh_state({
                keep_action: "whoami",
                detail_override: format_error_detail(t({ zh: "当前账号不可用", en: "Current account unavailable" }), error instanceof Error ? error.message : String(error)),
            });
        }
        return;
    }
    if (params.action === "logout") {
        const federation_url = resolve_selected_federation_url(readCityState());
        const state = readCityState();
        const sessions = { ...(state.sessions ?? {}) };
        delete sessions[federation_url];
        writeCityState({ ...state, sessions });
        await params.refresh_state({
            keep_action: "login",
            detail_override: t({
                zh: `已登出当前 City：${federation_url}`,
                en: `Signed out from current City: ${federation_url}`,
            }),
        });
        return;
    }
}
async function handle_city_prompt_action(action) {
    if (action === "connect") {
        const federation_url = await prompt_city_url();
        if (!federation_url) {
            return {
                initial_action: "connect",
                detail_override: t({ zh: "已取消添加 City。", en: "Join Federation cancelled." }),
            };
        }
        writeCityState(upsert_federation_profile(readCityState(), { federation_url }));
        return {
            initial_action: "status",
            detail_override: t({
                zh: `已添加并选择 City：${federation_url}`,
                en: `Added and selected City: ${federation_url}`,
            }),
        };
    }
    if (action === "use") {
        const server = await prompt_federation();
        if (!server) {
            return {
                initial_action: "use",
                detail_override: t({ zh: "已取消选择 City。", en: "Select Federation cancelled." }),
            };
        }
        select_federation(server);
        return {
            initial_action: "status",
            detail_override: t({
                zh: `已选择 Federation：${server.federation_url}`,
                en: `Selected Federation: ${server.federation_url}`,
            }),
        };
    }
    if (action === "login") {
        const membership = read_federation_membership_state();
        const session = await performCityUserLogin({
            federation_url: membership.federation_url,
            city_id: read_current_city_session()?.city_id || DEFAULT_CITY_ID,
        }, { silent: true });
        if (!session) {
            return {
                initial_action: "login",
                detail_override: t({ zh: "登录已取消。", en: "Sign-in cancelled." }),
            };
        }
        save_city_user_session(session);
        return {
            initial_action: "whoami",
            detail_override: format_session_detail(session),
        };
    }
    if (action === "recharge") {
        const input = await prompt_recharge_input();
        if (!input) {
            return {
                initial_action: "recharge",
                detail_override: t({ zh: "充值已取消。", en: "Recharge cancelled." }),
            };
        }
        try {
            const result = await rechargeCurrentCityUser(input);
            return {
                initial_action: "recharge",
                detail_override: format_recharge_result(result),
            };
        }
        catch (error) {
            return {
                initial_action: "recharge",
                detail_override: format_error_detail(t({ zh: "充值失败", en: "Recharge failed" }), error instanceof Error ? error.message : String(error)),
            };
        }
    }
    if (action === "language") {
        const locale = await promptAndPersistCityCliLocale({ silent: true });
        return {
            initial_action: "language",
            detail_override: locale
                ? t({
                    zh: locale === "zh" ? "当前默认语言已保存为中文。" : "当前默认语言已保存为英文。",
                    en: locale === "zh"
                        ? "Chinese has been saved as the default language."
                        : "English has been saved as the default language.",
                })
                : t({ zh: "语言切换已取消。", en: "Language switch cancelled." }),
        };
    }
    return {
        initial_action: "status",
    };
}
function is_prompt_action(action) {
    return action === "connect" ||
        action === "use" ||
        action === "login" ||
        action === "recharge" ||
        action === "language";
}
function create_city_manager_shell(state) {
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
        label: ` ${t({ zh: "City 连接", en: "City membership" })} `,
        style: {
            border: { fg: "green" },
        },
    });
    const main_box = blessed.box({
        parent: screen,
        top: 0,
        left: "34%",
        width: "66%",
        height: "100%-3",
        border: "line",
        label: ` ${t({ zh: "详情", en: "Detail" })} `,
        style: {
            border: { fg: "green" },
        },
    });
    const header_box = blessed.box({
        parent: main_box,
        top: 0,
        left: 1,
        width: "100%-2",
        height: 4,
        tags: true,
        content: format_header(state),
    });
    const detail_box = blessed.box({
        parent: main_box,
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
    });
    return {
        screen,
        sidebar_box,
        main_box,
        header_box,
        detail_box,
        footer_box,
    };
}
async function prompt_city_url() {
    const response = (await prompts({
        type: "text",
        name: "federation_url",
        message: "City URL",
        initial: DEFAULT_FEDERATION_URL,
    }));
    const federation_url = normalizeCityUrl(String(response.federation_url || ""));
    return federation_url || null;
}
async function prompt_federation() {
    const servers = list_federations();
    const response = (await prompts({
        type: "select",
        name: "federation_url",
        message: t({
            zh: "选择 Federation",
            en: "Select Federation"
        }),
        choices: servers.map((server) => ({
            title: server.selected ? `* ${server.name}` : server.name,
            description: `${server.source} · ${server.federation_url}`,
            value: server.federation_url,
        })),
        initial: Math.max(0, servers.findIndex((server) => server.selected)),
    }));
    const federation_url = readCityString(response.federation_url);
    if (!federation_url)
        return null;
    return servers.find((server) => server.federation_url === federation_url) ?? null;
}
async function prompt_recharge_input() {
    const response = (await prompts([
        {
            type: "number",
            name: "amount",
            message: "充值金额",
            min: 1,
            validate: (value) => Number.isInteger(value) && value > 0 ? true : "请输入正整数",
        },
        {
            type: "text",
            name: "note",
            message: "说明（可选）",
            initial: "City recharge",
        },
        {
            type: "confirm",
            name: "open_checkout",
            message: "创建后打开支付页面？",
            initial: true,
        },
    ]));
    const amount = Number(response.amount);
    if (!Number.isInteger(amount) || amount <= 0)
        return null;
    return {
        amount,
        method_id: "stripe",
        note: readCityString(response.note),
        open_checkout: response.open_checkout !== false,
    };
}
function select_federation(server) {
    writeCityState(upsert_federation_profile(readCityState(), {
        federation_url: server.federation_url,
        name: server.name,
    }));
}
function format_header(state) {
    return [
        `{bold}${t({ zh: "管理 Federation", en: "Manage Federation" })}{/bold}`,
        state.subtitle,
        state.last_message ? `{green-fg}${state.last_message}{/green-fg}` : "",
    ].filter(Boolean).join("\n");
}
function format_city_item_label(item) {
    if (is_disabled_item(item)) {
        return `── ${item.title} ──`;
    }
    return item.title;
}
function format_city_detail(item) {
    if (!item) {
        return t({ zh: "未选择项目", en: "No item selected" });
    }
    if (is_disabled_item(item)) {
        return [
            `{bold}${item.title}{/bold}`,
            t({
                zh: "这是侧边栏分区标题，用于区分当前菜单里的操作区域。",
                en: "This is a sidebar section heading used to group actions in the current menu.",
            }),
        ].join("\n");
    }
    return [
        `{bold}${item.title}{/bold}`,
        item.subtitle,
        "",
        item.detail,
    ].filter(Boolean).join("\n");
}
function format_footer(item) {
    const base = t({
        zh: "Enter 执行动作 · Esc / q 退出 · ↑↓ 切换 · PgUp/PgDn 滚动详情",
        en: "Enter run action · Esc / q quit · ↑↓ navigate · PgUp/PgDn scroll detail",
    });
    if (!item || is_disabled_item(item))
        return base;
    return `${base} · ${item.subtitle}`;
}
function build_city_subtitle(membership, balance) {
    const login_state = membership.has_user_token
        ? t({ zh: "已登录", en: "signed in" })
        : t({ zh: "未登录", en: "not signed in" });
    const balance_text = balance
        ? t({
            zh: ` · 余额 ${balance.balance}`,
            en: ` · balance ${balance.balance}`,
        })
        : "";
    return `${membership.federation_url} · ${login_state}${balance_text}`;
}
function format_membership_detail(membership) {
    return t({
        zh: [
            "{bold}当前 Federation{/bold}",
            `URL：${membership.federation_url}`,
            `source：${membership.source}`,
            `city id：${membership.city_id}`,
            `登录态：${membership.has_user_token ? "已登录" : "未登录"}`,
            membership.user_id ? `账号 ID：${membership.user_id}` : "",
            membership.user_label ? `账号：${membership.user_label}` : "",
        ].filter(Boolean).join("\n"),
        en: [
            "{bold}Current Federation{/bold}",
            `URL: ${membership.federation_url}`,
            `source: ${membership.source}`,
            `city id: ${membership.city_id}`,
            `session: ${membership.has_user_token ? "signed in" : "not signed in"}`,
            membership.user_id ? `account ID: ${membership.user_id}` : "",
            membership.user_label ? `account: ${membership.user_label}` : "",
        ].filter(Boolean).join("\n"),
    });
}
function format_federation_list_detail(servers) {
    return [
        `{bold}${t({ zh: "可用 Federation", en: "Available Federations" })}{/bold}`,
        "",
        ...servers.map((server) => [
            `${server.selected ? "*" : "-"} ${server.name}`,
            `  URL: ${server.federation_url}`,
            `  source: ${server.source}`,
            `  session: ${server.has_user_session ? "yes" : "no"}`,
            `  admin: ${server.has_admin_secret_key ? "yes" : "no"}`,
        ].join("\n")),
    ].join("\n");
}
function format_login_detail(membership) {
    return t({
        zh: [
            "{bold}登录{/bold}",
            `当前 City：${membership.federation_url}`,
            "",
            "Enter 后选择可用登录方式。登录成功后，账号和余额会直接显示在这个 TUI 中。",
        ].join("\n"),
        en: [
            "{bold}Sign in{/bold}",
            `Current City: ${membership.federation_url}`,
            "",
            "Press Enter to choose an available sign-in method. After sign-in, account and balance will appear in this TUI.",
        ].join("\n"),
    });
}
function format_balance_detail(account) {
    return [
        `{bold}${t({ zh: "余额", en: "Balance" })}{/bold}`,
        String(account.balance),
        "",
        `user: ${account.user_id}`,
        `created: ${account.created_at}`,
        `updated: ${account.updated_at}`,
    ].join("\n");
}
function format_current_user_detail(user) {
    return [
        `{bold}${t({ zh: "当前账号", en: "Current account" })}{/bold}`,
        `URL: ${user.federation_url}`,
        `city: ${user.city_id}`,
        `user: ${user.user_id || "unknown"}`,
        user.user_label ? `label: ${user.user_label}` : "",
        `source: ${user.source}`,
        `env url: ${user.env_overrides.federation_url ? "yes" : "no"}`,
        `env city: ${user.env_overrides.city_id ? "yes" : "no"}`,
        `env token: ${user.env_overrides.user_token ? "yes" : "no"}`,
        user.warnings.length > 0 ? `\n${user.warnings.join("\n")}` : "",
    ].filter(Boolean).join("\n");
}
function format_session_detail(session) {
    return [
        `{bold}${t({ zh: "登录成功", en: "Signed in" })}{/bold}`,
        `URL: ${session.federation_url}`,
        `city: ${session.city_id}`,
        `user: ${session.user_id || "unknown"}`,
        session.user_label ? `label: ${session.user_label}` : "",
        `updated: ${session.updated_at}`,
    ].filter(Boolean).join("\n");
}
function format_recharge_result(result) {
    const checkout_url = typeof result.checkout.checkout_url === "string"
        ? result.checkout.checkout_url.trim()
        : "";
    return [
        `{bold}${t({ zh: "充值已创建", en: "Recharge created" })}{/bold}`,
        `amount: ${result.topup.amount}`,
        `status: ${result.topup.status}`,
        `topup: ${result.topup.topup_id}`,
        `method: ${result.method_id}`,
        result.checkout.payment_id ? `payment: ${result.checkout.payment_id}` : "",
        checkout_url ? `checkout: ${checkout_url}` : "",
        `browser: ${result.opened ? "opened" : "not opened"}`,
    ].filter(Boolean).join("\n");
}
function format_error_detail(title, message) {
    return [
        `{red-fg}{bold}${title}{/bold}{/red-fg}`,
        message || t({ zh: "未知错误", en: "Unknown error" }),
    ].join("\n");
}
function loading_text(message) {
    return `{yellow-fg}${message}...{/yellow-fg}`;
}
function format_locale_description(cli_locale) {
    if (cli_locale === "zh") {
        return t({
            zh: "当前默认语言：中文",
            en: "Current default language: Chinese",
        });
    }
    return t({
        zh: "当前默认语言：英文",
        en: "Current default language: English",
    });
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
function find_action_index(items, action) {
    const index = items.findIndex((item) => item.id === action);
    return index >= 0 ? index : resolve_loop_selectable_index(items, 0, 0);
}
function is_disabled_item(item) {
    return is_disabled_selectable_item(item);
}
//# sourceMappingURL=FederationManagerTui.js.map