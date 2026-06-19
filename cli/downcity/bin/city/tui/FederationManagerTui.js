/**
 * Federation 交互式管理 TUI 入口。
 *
 * 关键点（中文）
 * - 负责创建 blessed 全屏界面、主循环与动作分发。
 * - 状态构建与动作处理拆到 FederationManagerState.ts。
 * - 格式化与提示分别拆到 FederationManagerFormat.ts 与 FederationManagerPrompts.ts。
 */
import blessed from "neo-blessed";
import { t } from "../../shared/CliLocale.js";
import { resolve_loop_selectable_index, resolve_next_loop_selectable_index, } from "./SelectableList.js";
import { build_city_manager_state, handle_city_action, handle_city_prompt_action, is_prompt_action, } from "./FederationManagerState.js";
import { format_header, format_city_item_label, format_city_detail, format_footer, is_disabled_item, } from "./FederationManagerFormat.js";
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
function find_action_index(items, action) {
    const index = items.findIndex((item) => item.id === action);
    return index >= 0 ? index : resolve_loop_selectable_index(items, 0, 0);
}
//# sourceMappingURL=FederationManagerTui.js.map