/**
 * Town 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `prompts` 的交互行为，但尽量保持返回结构兼容。
 * - 先覆盖当前仓库里实际使用到的 `select / multiselect / text / password / confirm / number`。
 * - 选择类问题统一在左侧 sidebar 交互，右侧 main_section 只展示详情或输入。
 * - 脚本模式仍由调用方自己兜底；这里默认只服务交互式 TTY 场景。
 */
import blessed from "neo-blessed";
import { t } from "../shared/CliLocale.js";
/**
 * Town 使用的 prompts 默认导出。
 */
export default async function prompts(input) {
    const questions = Array.isArray(input) ? input : [input];
    const answers = {};
    for (const question of questions) {
        const value = await run_prompt_question(question);
        if (value === undefined) {
            return answers;
        }
        answers[question.name] = value;
    }
    return answers;
}
async function run_prompt_question(question) {
    if (question.type === "select") {
        return await run_select_prompt(question);
    }
    if (question.type === "multiselect") {
        return await run_multiselect_prompt(question);
    }
    if (question.type === "confirm") {
        return await run_confirm_prompt(question);
    }
    if (question.type === "password") {
        return await run_text_prompt(question, { secret: true });
    }
    if (question.type === "number") {
        return await run_number_prompt(question);
    }
    return await run_text_prompt(question, { secret: false });
}
async function run_select_prompt(question) {
    const choices = question.choices ?? [];
    const initial_index = normalize_initial_index(question.initial, choices.length);
    return await new Promise((resolve) => {
        const shell = create_prompt_shell(question.message);
        const { screen } = shell;
        let finished = false;
        let raw_input_listener;
        let selected_index = initial_index;
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            cleanup();
            screen.destroy();
            resolve(value);
        };
        const cleanup = () => {
            if (raw_input_listener) {
                process.stdin.off("data", raw_input_listener);
                raw_input_listener = undefined;
            }
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
            items: choices.map(format_choice_sidebar_label),
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
            content: format_choice_detail(choices[initial_index]),
            style: {
                fg: "white",
            },
        });
        shell.footer_box.setContent(select_footer_text());
        list.select(initial_index);
        list.focus();
        list.on("select item", (_item, index_value) => {
            selected_index = clamp_selected_index(index_value, choices.length, selected_index);
            detail.setContent(format_choice_detail(choices[selected_index]));
            shell.footer_box.setContent(format_select_footer(choices[selected_index]));
            screen.render();
        });
        list.key(["enter"], () => {
            finish(choices[selected_index]?.value);
        });
        screen.key(["escape", "q", "C-c"], () => finish(undefined));
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(undefined);
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                finish(choices[selected_index]?.value);
            }
        };
        process.stdin.on("data", raw_input_listener);
        shell.footer_box.setContent(format_select_footer(choices[selected_index]));
        screen.render();
    });
}
async function run_multiselect_prompt(question) {
    const choices = question.choices ?? [];
    const selected_indexes = new Set();
    let current_index = normalize_initial_index(question.initial, choices.length);
    return await new Promise((resolve) => {
        const shell = create_prompt_shell(question.message);
        const { screen } = shell;
        let finished = false;
        let raw_input_listener;
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            cleanup();
            screen.destroy();
            resolve(value);
        };
        const cleanup = () => {
            if (raw_input_listener) {
                process.stdin.off("data", raw_input_listener);
                raw_input_listener = undefined;
            }
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
            items: build_multiselect_items(choices, selected_indexes),
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
            content: format_choice_detail(choices[current_index]),
            style: {
                fg: "white",
            },
        });
        shell.footer_box.setContent(multiselect_footer_text());
        const sync_list = () => {
            list.setItems(build_multiselect_items(choices, selected_indexes));
            list.select(current_index);
            detail.setContent(format_choice_detail(choices[current_index]));
            shell.footer_box.setContent(format_multiselect_footer(choices[current_index]));
            screen.render();
        };
        list.select(current_index);
        list.focus();
        list.on("select item", (_item, index_value) => {
            current_index = clamp_selected_index(index_value, choices.length, current_index);
            detail.setContent(format_choice_detail(choices[current_index]));
            shell.footer_box.setContent(format_multiselect_footer(choices[current_index]));
            screen.render();
        });
        list.key(["space"], () => {
            if (selected_indexes.has(current_index)) {
                selected_indexes.delete(current_index);
            }
            else {
                selected_indexes.add(current_index);
            }
            sync_list();
        });
        list.key(["enter"], () => {
            finish(build_multiselect_values(choices, selected_indexes));
        });
        screen.key(["escape", "q", "C-c"], () => finish(undefined));
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(undefined);
                return;
            }
            if (text.includes(" ")) {
                if (selected_indexes.has(current_index)) {
                    selected_indexes.delete(current_index);
                }
                else {
                    selected_indexes.add(current_index);
                }
                sync_list();
            }
            if (text.includes("\r") || text.includes("\n")) {
                finish(build_multiselect_values(choices, selected_indexes));
            }
        };
        process.stdin.on("data", raw_input_listener);
        shell.footer_box.setContent(format_multiselect_footer(choices[current_index]));
        screen.render();
    });
}
async function run_confirm_prompt(question) {
    const initial_value = question.initial === true;
    const choices = [
        {
            title: t({ zh: "是", en: "Yes" }),
            description: t({
                zh: "确认执行该动作",
                en: "Confirm this action",
            }),
            value: true,
        },
        {
            title: t({ zh: "否", en: "No" }),
            description: t({
                zh: "取消并返回",
                en: "Cancel and go back",
            }),
            value: false,
        },
    ];
    return await new Promise((resolve) => {
        const shell = create_prompt_shell(question.message);
        const { screen } = shell;
        let finished = false;
        let raw_input_listener;
        let selected_index = initial_value ? 0 : 1;
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            cleanup();
            screen.destroy();
            resolve(value);
        };
        const cleanup = () => {
            if (raw_input_listener) {
                process.stdin.off("data", raw_input_listener);
                raw_input_listener = undefined;
            }
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
            items: choices.map(format_choice_sidebar_label),
        });
        const note = blessed.box({
            parent: shell.main_box,
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            tags: true,
            padding: { left: 1, right: 1, top: 1, bottom: 1 },
            content: format_choice_detail(choices[initial_value ? 0 : 1]),
        });
        shell.footer_box.setContent(confirm_footer_text());
        list.select(initial_value ? 0 : 1);
        list.focus();
        list.key(["enter"], () => {
            finish(Boolean(choices[selected_index]?.value));
        });
        list.on("select item", (_item, index_value) => {
            selected_index = clamp_selected_index(index_value, choices.length, selected_index);
            note.setContent(format_choice_detail(choices[selected_index]));
            shell.footer_box.setContent(format_confirm_footer(choices[selected_index]));
            screen.render();
        });
        screen.key(["escape", "q", "C-c"], () => finish(undefined));
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(undefined);
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                finish(Boolean(choices[selected_index]?.value));
            }
        };
        process.stdin.on("data", raw_input_listener);
        shell.footer_box.setContent(format_confirm_footer(choices[selected_index]));
        screen.render();
    });
}
async function run_text_prompt(question, options) {
    let error_message = "";
    while (true) {
        const submitted_value = await open_text_prompt_once(question, {
            secret: options.secret,
            error_message,
        });
        if (submitted_value === undefined) {
            return undefined;
        }
        const validated = await validate_prompt_value(question, submitted_value);
        if (validated === true) {
            return submitted_value;
        }
        error_message = validated;
    }
}
async function run_number_prompt(question) {
    let error_message = "";
    while (true) {
        const submitted_value = await open_text_prompt_once(question, {
            secret: false,
            error_message,
        });
        if (submitted_value === undefined) {
            return undefined;
        }
        const parsed_value = Number(submitted_value);
        if (!Number.isFinite(parsed_value)) {
            error_message = t({
                zh: "请输入有效数字",
                en: "Please enter a valid number",
            });
            continue;
        }
        if (typeof question.min === "number" && parsed_value < question.min) {
            error_message = t({
                zh: `最小值为 ${question.min}`,
                en: `Minimum value is ${question.min}`,
            });
            continue;
        }
        const validated = await validate_prompt_value(question, parsed_value);
        if (validated === true) {
            return parsed_value;
        }
        error_message = validated;
    }
}
async function open_text_prompt_once(question, options) {
    const initial_value = String(question.initial ?? "");
    return await new Promise((resolve) => {
        const shell = create_prompt_shell(question.message);
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
            content: question.message,
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
            value: initial_value,
            style: {
                border: {
                    fg: options.error_message ? "red" : "green",
                },
                fg: "white",
                bg: "black",
                focus: {
                    border: {
                        fg: options.error_message ? "red" : "green",
                    },
                },
            },
        });
        const render_hint = () => {
            hint_box.setContent(options.error_message);
            screen.render();
        };
        shell.footer_box.setContent(text_footer_text(options.secret));
        screen.key(["escape", "C-c"], () => finish(undefined));
        textbox.key(["enter", "return"], () => {
            // 关键点（中文）：不同终端会把回车解析为 enter 或 return，统一转成 textbox submit。
            textbox.submit();
        });
        textbox.key(["escape", "C-c"], () => finish(undefined));
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
                finish(undefined);
                return;
            }
            finish(normalize_textbox_value(value));
        });
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(undefined);
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
async function validate_prompt_value(question, value) {
    if (!question.validate) {
        return true;
    }
    const result = await question.validate(value);
    return result === true
        ? true
        : String(result || t({ zh: "输入无效", en: "Invalid input" }));
}
function create_prompt_shell(title) {
    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        title,
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
    blessed.box({
        parent: sidebar_box,
        top: 0,
        left: 1,
        width: "100%-2",
        height: 2,
        content: format_breadcrumb(title),
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
    const footer_box = blessed.box({
        parent: screen,
        left: 0,
        bottom: 0,
        width: "100%",
        height: 3,
        border: "line",
        padding: { left: 1, top: 1 },
        style: {
            border: { fg: "green" },
            fg: "gray",
        },
        content: "",
    });
    return {
        screen,
        sidebar_box,
        main_box,
        footer_box,
    };
}
function build_list_style() {
    return {
        border: { fg: "green" },
        item: { fg: "white" },
        selected: {
            fg: "black",
            bg: "green",
            bold: true,
        },
    };
}
function format_choice_label(choice) {
    return String(choice?.title ?? choice?.label ?? "").trim();
}
function format_choice_sidebar_label(choice) {
    return `${format_choice_label(choice)}  ·  ${choice_description(choice)}`;
}
function format_choice_detail(choice) {
    if (!choice) {
        return t({
            zh: "未选择项目",
            en: "No item selected",
        });
    }
    const title = String(choice.title ?? choice.label ?? "").trim();
    const hint = choice_description(choice);
    const value = choice.value === undefined ? "" : String(choice.value);
    return [
        `{bold}${title}{/bold}`,
        hint,
        value ? `\n${t({ zh: "值", en: "value" })}: ${value}` : "",
    ].filter(Boolean).join("\n");
}
function choice_description(choice) {
    const hint = String(choice?.description ?? choice?.hint ?? "").trim();
    if (hint)
        return hint;
    const title = format_choice_label(choice);
    return t({
        zh: `选择 ${title}`,
        en: `Select ${title}`,
    });
}
/**
 * 单选 footer 文案。
 */
function select_footer_text() {
    return t({
        zh: "Enter 选择 · Esc 取消 · ↑↓ / j k 切换",
        en: "Enter choose · Esc cancel · ↑↓ / j k navigate",
    });
}
function format_select_footer(choice) {
    if (!choice)
        return select_footer_text();
    return `${select_footer_text()} · ${choice_description(choice)}`;
}
/**
 * 多选 footer 文案。
 */
function multiselect_footer_text() {
    return t({
        zh: "Space 切换 · Enter 确认 · Esc 取消 · ↑↓ / j k 切换",
        en: "Space toggle · Enter confirm · Esc cancel · ↑↓ / j k navigate",
    });
}
function format_multiselect_footer(choice) {
    if (!choice)
        return multiselect_footer_text();
    return `${multiselect_footer_text()} · ${choice_description(choice)}`;
}
/**
 * 确认 footer 文案。
 */
function confirm_footer_text() {
    return t({
        zh: "Enter 选择 · Esc 取消",
        en: "Enter choose · Esc cancel",
    });
}
function format_confirm_footer(choice) {
    if (!choice)
        return confirm_footer_text();
    return `${confirm_footer_text()} · ${choice_description(choice)}`;
}
/**
 * 输入 footer 文案。
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
function build_multiselect_items(choices, selected_indexes) {
    return choices.map((choice, index) => {
        const checked = selected_indexes.has(index) ? "[x]" : "[ ]";
        return `${checked} ${format_choice_sidebar_label(choice)}`;
    });
}
function build_multiselect_values(choices, selected_indexes) {
    return [...selected_indexes]
        .sort((left, right) => left - right)
        .map((index) => choices[index]?.value)
        .filter((value) => value !== undefined);
}
function normalize_initial_index(initial, length) {
    if (length <= 0) {
        return 0;
    }
    const numeric_value = Number(initial);
    if (!Number.isInteger(numeric_value) || numeric_value < 0) {
        return 0;
    }
    return Math.min(length - 1, numeric_value);
}
function clamp_selected_index(value, length, fallback) {
    if (length <= 0)
        return 0;
    const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
    return Math.max(0, Math.min(length - 1, index));
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
function format_breadcrumb(value) {
    return value.padEnd(80, " ");
}
//# sourceMappingURL=Prompts.js.map