/**
 * Town 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `prompts` 的交互行为，但尽量保持返回结构兼容。
 * - 先覆盖当前仓库里实际使用到的 `select / multiselect / text / password / confirm / number`。
 * - 脚本模式仍由调用方自己兜底；这里默认只服务交互式 TTY 场景。
 */
import blessed from "neo-blessed";
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
        const screen = create_screen(question.message);
        let finished = false;
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            screen.destroy();
            resolve(value);
        };
        const list = blessed.list({
            parent: screen,
            top: 0,
            left: 0,
            width: "42%",
            height: "100%-3",
            keys: true,
            vi: true,
            mouse: true,
            border: "line",
            label: " Select ",
            style: build_list_style(),
            items: choices.map((item) => format_choice_title(item)),
        });
        const detail = blessed.box({
            parent: screen,
            top: 0,
            left: "42%",
            width: "58%",
            height: "100%-3",
            border: "line",
            label: " Detail ",
            padding: { left: 1, right: 1, top: 1, bottom: 1 },
            scrollable: true,
            alwaysScroll: true,
            tags: true,
            content: format_choice_detail(choices[initial_index]),
            style: {
                border: { fg: "green" },
            },
        });
        create_footer(screen, "Enter choose · Esc cancel · ↑↓ / j k navigate");
        list.select(initial_index);
        list.focus();
        list.on("select item", (_item, index_value) => {
            const index = typeof index_value === "number" ? index_value : 0;
            detail.setContent(format_choice_detail(choices[index]));
            screen.render();
        });
        list.key(["enter"], () => {
            const index = typeof list.selected === "number" ? list.selected : initial_index;
            finish(choices[index]?.value);
        });
        screen.key(["escape", "q", "C-c"], () => finish(undefined));
        screen.render();
    });
}
async function run_multiselect_prompt(question) {
    const choices = question.choices ?? [];
    const selected_indexes = new Set();
    let current_index = normalize_initial_index(question.initial, choices.length);
    return await new Promise((resolve) => {
        const screen = create_screen(question.message);
        let finished = false;
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            screen.destroy();
            resolve(value);
        };
        const list = blessed.list({
            parent: screen,
            top: 0,
            left: 0,
            width: "42%",
            height: "100%-3",
            keys: true,
            vi: true,
            mouse: true,
            border: "line",
            label: " Multi Select ",
            style: build_list_style(),
            items: build_multiselect_items(choices, selected_indexes),
        });
        const detail = blessed.box({
            parent: screen,
            top: 0,
            left: "42%",
            width: "58%",
            height: "100%-3",
            border: "line",
            label: " Detail ",
            padding: { left: 1, right: 1, top: 1, bottom: 1 },
            scrollable: true,
            alwaysScroll: true,
            tags: true,
            content: format_choice_detail(choices[current_index]),
            style: {
                border: { fg: "green" },
            },
        });
        create_footer(screen, "Space toggle · Enter confirm · Esc cancel · ↑↓ / j k navigate");
        const sync_list = () => {
            list.setItems(build_multiselect_items(choices, selected_indexes));
            list.select(current_index);
            detail.setContent(format_choice_detail(choices[current_index]));
            screen.render();
        };
        list.select(current_index);
        list.focus();
        list.on("select item", (_item, index_value) => {
            current_index = typeof index_value === "number" ? index_value : current_index;
            detail.setContent(format_choice_detail(choices[current_index]));
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
            const values = [...selected_indexes]
                .sort((left, right) => left - right)
                .map((index) => choices[index]?.value)
                .filter((value) => value !== undefined);
            finish(values);
        });
        screen.key(["escape", "q", "C-c"], () => finish(undefined));
        screen.render();
    });
}
async function run_confirm_prompt(question) {
    const initial_value = question.initial === true;
    const choices = [
        {
            title: "Yes",
            description: "Confirm this action",
            value: true,
        },
        {
            title: "No",
            description: "Cancel and go back",
            value: false,
        },
    ];
    return await new Promise((resolve) => {
        const screen = create_screen(question.message);
        let finished = false;
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            screen.destroy();
            resolve(value);
        };
        const list = blessed.list({
            parent: screen,
            top: "center",
            left: "center",
            width: "60%",
            height: 8,
            keys: true,
            vi: true,
            mouse: true,
            border: "line",
            label: " Confirm ",
            style: build_list_style(),
            items: choices.map((item) => item.title),
        });
        const note = blessed.box({
            parent: screen,
            top: "center-6",
            left: "center",
            width: "60%",
            height: 3,
            tags: true,
            align: "center",
            content: question.message,
        });
        create_footer(screen, "Enter choose · Esc cancel");
        list.select(initial_value ? 0 : 1);
        list.focus();
        list.key(["enter"], () => {
            const index = typeof list.selected === "number" ? list.selected : (initial_value ? 0 : 1);
            note.setContent(choices[index]?.description || question.message);
            finish(Boolean(choices[index]?.value));
        });
        screen.key(["escape", "q", "C-c"], () => finish(undefined));
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
            error_message = "Please enter a valid number";
            continue;
        }
        if (typeof question.min === "number" && parsed_value < question.min) {
            error_message = `Minimum value is ${question.min}`;
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
        const screen = create_screen(question.message);
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
            parent: screen,
            top: 4,
            left: "center",
            width: "70%",
            height: 3,
            align: "center",
            tags: true,
            content: question.message,
        });
        const hint_box = blessed.box({
            parent: screen,
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
            parent: screen,
            top: 8,
            left: "center",
            width: "70%",
            height: 5,
            border: "line",
            label: options.secret ? " Secret " : " Input ",
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
        create_footer(screen, "Type text · Enter submit · Esc cancel · Ctrl+U clear");
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
    return result === true ? true : String(result || "Invalid input");
}
function create_screen(title) {
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
    blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: "100%",
        height: 3,
        tags: true,
        border: "line",
        padding: { left: 1, top: 1 },
        content: `{bold}${title}{/bold}`,
        style: {
            border: { fg: "green" },
        },
    });
    return screen;
}
function create_footer(screen, content) {
    blessed.box({
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
        content,
    });
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
function format_choice_title(choice) {
    const title = String(choice?.title ?? choice?.label ?? "").trim();
    const hint = String(choice?.description ?? choice?.hint ?? "").trim();
    return hint ? `${title}\n${hint}` : title;
}
function format_choice_detail(choice) {
    if (!choice) {
        return "No item selected";
    }
    const title = String(choice.title ?? choice.label ?? "").trim();
    const hint = String(choice.description ?? choice.hint ?? "").trim();
    const value = choice.value === undefined ? "" : String(choice.value);
    return [
        `{bold}${title}{/bold}`,
        hint,
        value ? `\nvalue: ${value}` : "",
    ].filter(Boolean).join("\n");
}
function build_multiselect_items(choices, selected_indexes) {
    return choices.map((choice, index) => {
        const checked = selected_indexes.has(index) ? "[x]" : "[ ]";
        const title = String(choice.title ?? choice.label ?? "").trim();
        const hint = String(choice.description ?? choice.hint ?? "").trim();
        return hint ? `${checked} ${title}\n${hint}` : `${checked} ${title}`;
    });
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
//# sourceMappingURL=Prompts.js.map