/**
 * Admin TUI 输入循环模块。
 *
 * 关键点（中文）
 * - 负责侧边栏选择、文本输入、密码输入的交互循环。
 * - 与 Render 模块配合：数据变更时调用 Render 刷新屏幕。
 */
import blessed from "neo-blessed";
import { t } from "../../shared/CliLocale.js";
import { is_plain_escape_input, } from "../../federation/tui/AdminTuiShell.js";
import { is_disabled_option, render_sidebar_hint } from "../../federation/tui/AdminTuiRender.js";
/**
 * 运行侧边栏单选。
 */
export async function run_sidebar_select(input) {
    return await new Promise((resolve) => {
        let finished = false;
        let raw_input_listener;
        const list = input.shell.nav_list;
        let selected_index = resolve_selectable_index(input.options, input.initial_index, 0);
        const sync_selection = (index_value = list.selected) => {
            selected_index = resolve_selectable_index(input.options, index_value, selected_index);
            if (list.selected !== selected_index) {
                list.select(selected_index);
            }
            input.on_select_index(selected_index);
            input.on_focus_option?.(input.options[selected_index]);
            render_sidebar_hint(input.shell, input.options, selected_index);
        };
        const keypress_listener = (_ch, key) => {
            const key_name = get_key_name(key);
            if (key_name === "enter") {
                sync_selection();
                if (is_disabled_option(input.options[selected_index])) {
                    return;
                }
                finish(input.options[selected_index]?.value);
                return;
            }
            if (key_name === "escape" || key_name === "q" || key_name === "C-c") {
                finish(undefined);
                return;
            }
            setImmediate(() => {
                if (finished)
                    return;
                sync_selection();
            });
        };
        const select_item_listener = (_item, index_value) => {
            sync_selection(index_value);
        };
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            cleanup();
            resolve(value);
        };
        const cleanup = () => {
            if (raw_input_listener) {
                process.stdin.off("data", raw_input_listener);
                raw_input_listener = undefined;
            }
            list.removeListener("keypress", keypress_listener);
            list.removeListener("select item", select_item_listener);
        };
        list.select(selected_index);
        list.focus();
        sync_selection(selected_index);
        list.on("keypress", keypress_listener);
        list.on("select item", select_item_listener);
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(undefined);
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                sync_selection();
                if (is_disabled_option(input.options[selected_index])) {
                    return;
                }
                finish(input.options[selected_index]?.value);
            }
        };
        process.stdin.on("data", raw_input_listener);
        input.shell.screen.render();
    });
}
/**
 * 在内容区运行文本/密码输入。
 */
export async function run_text_in_content(shell, input) {
    return await new Promise((resolve) => {
        let finished = false;
        let raw_input_listener;
        shell.content_box.setLabel(` ${input.title} `);
        blessed.box({
            parent: shell.content_box,
            top: 1,
            left: "center",
            width: "88%",
            height: 3,
            align: "center",
            valign: "middle",
            tags: true,
            content: `{bold}${input.title}{/bold}`,
        });
        const textbox = blessed.textbox({
            parent: shell.content_box,
            top: 5,
            left: "center",
            width: "88%",
            height: 5,
            border: "line",
            label: ` ${input.secret
                ? t({ zh: "密文", en: "Secret" })
                : t({ zh: "输入", en: "Input" })} `,
            padding: { left: 1, right: 1, top: 1 },
            inputOnFocus: true,
            keys: true,
            mouse: true,
            censor: input.secret,
            style: {
                border: { fg: "cyan" },
                fg: "white",
                bg: "black",
            },
        });
        const hint = blessed.box({
            parent: shell.content_box,
            top: 11,
            left: "center",
            width: "88%",
            height: 2,
            align: "center",
            content: input.placeholder
                ? `${t({ zh: "占位提示", en: "placeholder" })}: ${input.placeholder}`
                : "",
            style: {
                fg: "gray",
            },
        });
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            if (raw_input_listener) {
                process.stdin.off("data", raw_input_listener);
            }
            resolve(value);
        };
        const cleanup = () => {
            if (raw_input_listener) {
                process.stdin.off("data", raw_input_listener);
                raw_input_listener = undefined;
            }
            textbox.destroy();
            hint.destroy();
        };
        input.on_cleanup(cleanup);
        textbox.focus();
        textbox.readInput((error, value) => {
            if (error) {
                finish(undefined);
                return;
            }
            finish(normalize_textbox_value(value));
        });
        textbox.key(["escape", "C-c"], () => finish(undefined));
        textbox.key(["C-u"], () => {
            textbox.clearValue();
            shell.screen.render();
        });
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(undefined);
                return;
            }
            if (text.includes("\u0015")) {
                textbox.clearValue();
                shell.screen.render();
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                setImmediate(() => submit_textbox_value(textbox, () => {
                    finish(normalize_textbox_value(textbox.getValue()));
                }));
            }
        };
        process.stdin.on("data", raw_input_listener);
        shell.screen.render();
    });
}
export function resolve_selectable_index(options, value, fallback) {
    const candidate = clamp_selected_index(value, options.length, fallback);
    if (!is_disabled_option(options[candidate])) {
        return candidate;
    }
    const fallback_index = clamp_selected_index(fallback, options.length, 0);
    const direction = candidate >= fallback_index ? 1 : -1;
    const first_try = find_selectable_index(options, candidate, direction);
    if (first_try >= 0)
        return first_try;
    const second_try = find_selectable_index(options, candidate, direction * -1);
    if (second_try >= 0)
        return second_try;
    return candidate;
}
function find_selectable_index(options, start_index, direction) {
    let index = start_index + direction;
    while (index >= 0 && index < options.length) {
        if (!is_disabled_option(options[index])) {
            return index;
        }
        index += direction;
    }
    return -1;
}
export function next_breadcrumb_parts(current_parts, section_title) {
    const normalized_title = section_title.trim();
    if (!normalized_title)
        return current_parts;
    const existing_index = current_parts.indexOf(normalized_title);
    if (existing_index >= 0) {
        return current_parts.slice(0, existing_index + 1);
    }
    return [...current_parts, normalized_title];
}
export function clamp_selected_index(value, length, fallback) {
    if (length <= 0)
        return 0;
    const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
    return Math.max(0, Math.min(length - 1, index));
}
export function get_key_name(key) {
    if (!key || typeof key !== "object")
        return undefined;
    const candidate = key;
    if (typeof candidate.full === "string")
        return candidate.full;
    if (typeof candidate.name === "string")
        return candidate.name;
    return undefined;
}
export function normalize_textbox_value(value) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
}
export function submit_textbox_value(textbox, finish) {
    if (textbox._done) {
        textbox._done("stop");
    }
    finish();
}
//# sourceMappingURL=AdminTuiInput.js.map