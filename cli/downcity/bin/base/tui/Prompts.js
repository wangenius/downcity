/**
 * City 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `@clack/prompts` 常用能力。
 * - 先覆盖当前 City CLI 实际使用到的 `select / text / password / confirm`。
 * - 选择类问题统一在左侧 sidebar，右侧 main_section 只展示详情或输入。
 * - 保持返回约定尽量接近 clack，便于渐进替换现有流程。
 */
import blessed from "neo-blessed";
import { t } from "../../shared/CliLocale.js";
import { create_city_tui_shell } from "./Shell.js";
/**
 * clack 兼容：select。
 */
export async function select(input) {
    return await new Promise((resolve) => {
        const shell = create_city_tui_shell({
            screen_title: input.message,
            breadcrumb: input.message,
            footer: select_footer_text(),
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
        const list = blessed.list({
            parent: shell.sidebar_box,
            top: 2,
            left: 0,
            width: "100%",
            height: "100%-2",
            keys: true,
            vi: true,
            mouse: true,
            style: build_list_style(),
            items: input.options.map(format_option_sidebar_label),
        });
        const detail = blessed.box({
            parent: shell.main_box,
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            padding: { left: 1, right: 1, top: 1, bottom: 1 },
            scrollable: true,
            alwaysScroll: true,
            tags: true,
            content: format_option_detail(input.options[0]),
            style: {
                fg: "white",
            },
        });
        const sync_selection = (index_value = list.selected) => {
            selected_index = clamp_selected_index(index_value, input.options.length, selected_index);
            detail.setContent(format_option_detail(input.options[selected_index]));
            shell.set_footer(format_select_footer(input.options[selected_index], false));
            screen.render();
        };
        list.select(0);
        list.focus();
        list.on("select item", (_item, index_value) => {
            sync_selection(index_value);
        });
        list.on("keypress", () => {
            // 关键点（中文）：焦点移动时同步详情区和 footer，避免描述只在确认后才出现。
            setImmediate(() => {
                if (finished)
                    return;
                sync_selection();
            });
        });
        list.key(["enter"], () => {
            sync_selection();
            finish(input.options[selected_index]?.value);
        });
        screen.key(["escape", "q", "C-c"], () => finish(cancel("cancel")));
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(cancel("cancel"));
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                finish(input.options[selected_index]?.value);
            }
        };
        process.stdin.on("data", raw_input_listener);
        sync_selection(selected_index);
        screen.render();
    });
}
/**
 * clack 兼容：text。
 */
export async function text(input) {
    return await run_text_prompt(input, false);
}
/**
 * clack 兼容：password。
 */
export async function password(input) {
    return await run_text_prompt(input, true);
}
/**
 * clack 兼容：confirm。
 */
export async function confirm(input) {
    const initial_value = input.initialValue === true;
    const options = [
        {
            label: "Yes",
            value: true,
            hint: t({
                zh: "确认执行该动作",
                en: "Confirm this action",
            }),
        },
        {
            label: t({
                zh: "否",
                en: "No",
            }),
            value: false,
            hint: t({
                zh: "取消并返回",
                en: "Cancel and go back",
            }),
        },
    ];
    options[0].label = t({
        zh: "是",
        en: "Yes",
    });
    return await new Promise((resolve) => {
        const shell = create_city_tui_shell({
            screen_title: input.message,
            breadcrumb: input.message,
            footer: confirm_footer_text(),
        });
        const { screen } = shell;
        let finished = false;
        let raw_input_listener;
        let selected_index = initial_value ? 0 : 1;
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
        const list = blessed.list({
            parent: shell.sidebar_box,
            top: 2,
            left: 0,
            width: "100%",
            height: "100%-2",
            keys: true,
            vi: true,
            mouse: true,
            style: build_list_style(),
            items: options.map(format_option_sidebar_label),
        });
        const detail = blessed.box({
            parent: shell.main_box,
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            padding: { left: 1, right: 1, top: 1, bottom: 1 },
            tags: true,
            content: format_option_detail(options[initial_value ? 0 : 1]),
        });
        const sync_selection = (index_value = list.selected) => {
            selected_index = clamp_selected_index(index_value, options.length, selected_index);
            detail.setContent(format_option_detail(options[selected_index]));
            shell.set_footer(format_select_footer(options[selected_index], true));
            screen.render();
        };
        list.select(initial_value ? 0 : 1);
        list.focus();
        list.on("select item", (_item, index_value) => {
            sync_selection(index_value);
        });
        list.on("keypress", () => {
            // 关键点（中文）：焦点移动时同步详情区和 footer，避免描述只在确认后才出现。
            setImmediate(() => {
                if (finished)
                    return;
                sync_selection();
            });
        });
        list.key(["enter"], () => {
            sync_selection();
            finish(options[selected_index]?.value);
        });
        screen.key(["escape", "q", "C-c"], () => finish(cancel("cancel")));
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(cancel("cancel"));
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                finish(options[selected_index]?.value);
            }
        };
        process.stdin.on("data", raw_input_listener);
        sync_selection(selected_index);
        screen.render();
    });
}
/**
 * clack 兼容：isCancel。
 */
export function isCancel(value) {
    return Boolean(value &&
        typeof value === "object" &&
        "__clack_cancel" in value);
}
/**
 * clack 兼容：intro。
 */
export function intro(_message) {
    // 关键点（中文）：TUI 模式下不再额外打印 intro，避免和全屏界面冲突。
}
/**
 * clack 兼容：log。
 */
export const log = {
    info(message) {
        console.log(message);
    },
    error(message) {
        console.error(message);
    },
    success(message) {
        console.log(message);
    },
};
async function run_text_prompt(input, secret) {
    let error_message = "";
    while (true) {
        const submitted_value = await open_text_prompt_once(input, {
            secret,
            error_message,
        });
        if (isCancel(submitted_value)) {
            return submitted_value;
        }
        const normalized_value = String(submitted_value ?? "");
        if (!input.validate) {
            return normalized_value;
        }
        const validate_result = input.validate(normalized_value);
        if (validate_result === true || validate_result === undefined) {
            return normalized_value;
        }
        error_message = String(validate_result || "Invalid input");
    }
}
async function open_text_prompt_once(input, options) {
    return await new Promise((resolve) => {
        const shell = create_city_tui_shell({
            screen_title: input.message,
            breadcrumb: input.message,
            footer: text_footer_text(options.secret),
        });
        const { screen } = shell;
        let finished = false;
        let raw_input_listener;
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
            top: 4,
            left: "center",
            width: "70%",
            height: 3,
            align: "center",
            tags: true,
            content: input.message,
        });
        const hint_box = blessed.box({
            parent: shell.main_box,
            top: 14,
            left: "center",
            width: "70%",
            height: 2,
            align: "center",
            tags: true,
            style: {
                fg: options.error_message ? "red" : "gray",
            },
        });
        const textbox = blessed.textbox({
            parent: shell.main_box,
            top: 8,
            left: "center",
            width: "70%",
            height: 5,
            border: "line",
            label: ` ${options.secret
                ? t({ zh: "密文", en: "Secret" })
                : t({ zh: "输入", en: "Input" })} `,
            padding: { left: 1, right: 1, top: 1 },
            inputOnFocus: true,
            keys: true,
            mouse: true,
            censor: options.secret,
            value: String(input.initialValue ?? ""),
            style: {
                border: { fg: options.error_message ? "red" : "cyan" },
                fg: "white",
                bg: "black",
                focus: {
                    border: { fg: options.error_message ? "red" : "cyan" },
                },
            },
        });
        const render_hint = () => {
            hint_box.setContent(options.error_message || format_input_hint(input.placeholder));
            screen.render();
        };
        screen.key(["escape", "C-c"], () => finish(cancel("cancel")));
        textbox.key(["enter", "return"], () => {
            // 关键点（中文）：不同终端会把回车解析为 enter 或 return，统一转成 textbox submit。
            textbox.submit();
        });
        textbox.key(["escape", "C-c"], () => finish(cancel("cancel")));
        screen.key(["C-u"], () => {
            textbox.clearValue();
            screen.render();
        });
        textbox.key(["C-u"], () => {
            textbox.clearValue();
            screen.render();
        });
        textbox.focus();
        render_hint();
        textbox.readInput((error, value) => {
            if (error) {
                finish(cancel("cancel"));
                return;
            }
            finish(normalize_textbox_value(value));
        });
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(cancel("cancel"));
                return;
            }
            if (text.includes("\u0015")) {
                textbox.clearValue();
                screen.render();
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                // 关键点（中文）：部分终端的回车不会触发 blessed 的 enter/return，延后一拍读取最新值。
                setImmediate(() => submit_textbox_value(textbox, () => {
                    finish(normalize_textbox_value(textbox.getValue()));
                }));
            }
        };
        process.stdin.on("data", raw_input_listener);
    });
}
function build_list_style() {
    return {
        border: { fg: "cyan" },
        item: { fg: "white" },
        selected: {
            fg: "black",
            bg: "cyan",
            bold: true,
        },
    };
}
function format_option_detail(option) {
    if (!option) {
        return t({
            zh: "未选择项目",
            en: "No item selected",
        });
    }
    return [
        `{bold}${option.label}{/bold}`,
        option_description(option),
        option.value !== undefined ? `\n${t({ zh: "值", en: "value" })}: ${String(option.value)}` : "",
    ].filter(Boolean).join("\n");
}
function format_option_sidebar_label(option) {
    return option.label;
}
function option_description(option) {
    const hint = String(option.hint ?? "").trim();
    if (hint)
        return hint;
    return t({
        zh: `选择 ${option.label}`,
        en: `Select ${option.label}`,
    });
}
function format_input_hint(placeholder) {
    const text = String(placeholder ?? "").trim();
    return text
        ? `${t({ zh: "占位提示", en: "placeholder" })}: ${text}`
        : "";
}
function clamp_selected_index(value, length, fallback) {
    if (length <= 0)
        return 0;
    const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
    return Math.max(0, Math.min(length - 1, index));
}
/**
 * 列表选择 footer 文案。
 */
function select_footer_text() {
    return t({
        zh: "Enter 选择 · Esc 取消 · ↑↓ / j k 切换",
        en: "Enter choose · Esc cancel · ↑↓ / j k navigate",
    });
}
function format_select_footer(option, confirm_mode) {
    const base_footer = confirm_mode ? confirm_footer_text() : select_footer_text();
    if (!option)
        return base_footer;
    return `${base_footer} · ${option_description(option)}`;
}
/**
 * 确认选择 footer 文案。
 */
function confirm_footer_text() {
    return t({
        zh: "Enter 选择 · Esc 取消",
        en: "Enter choose · Esc cancel",
    });
}
/**
 * 文本输入 footer 文案。
 */
function text_footer_text(secret) {
    return secret
        ? t({
            zh: "输入密文 · Enter 提交 · Esc 取消 · Ctrl+U 清空",
            en: "Type secret · Enter submit · Esc cancel · Ctrl+U clear",
        })
        : t({
            zh: "输入文本 · Enter 提交 · Esc 取消 · Ctrl+U 清空",
            en: "Type text · Enter submit · Esc cancel · Ctrl+U clear",
        });
}
function normalize_textbox_value(value) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
}
function submit_textbox_value(textbox, finish) {
    if (textbox._done) {
        // 关键点（中文）：stop 只释放 blessed 内部 readInput 状态，不触发 submit/cancel 回调。
        textbox._done("stop");
    }
    finish();
}
function is_plain_escape_input(text) {
    return text === "\u001b";
}
function cancel(reason) {
    return {
        __clack_cancel: true,
        reason,
    };
}
//# sourceMappingURL=Prompts.js.map