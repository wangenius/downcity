/**
 * City 交互式 TUI prompt 适配层。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 `@clack/prompts` 常用能力。
 * - 先覆盖当前 City CLI 实际使用到的 `select / text / password / confirm`。
 * - 保持返回约定尽量接近 clack，便于渐进替换现有流程。
 */
import blessed from "neo-blessed";
/**
 * clack 兼容：select。
 */
export async function select(input) {
    return await new Promise((resolve) => {
        const screen = create_screen(input.message);
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
            items: input.options.map((item) => format_option_title(item)),
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
            content: format_option_detail(input.options[0]),
            style: {
                border: { fg: "cyan" },
            },
        });
        create_footer(screen, "Enter choose · Esc cancel · ↑↓ / j k navigate");
        list.select(0);
        list.focus();
        list.on("select item", (_item, index_value) => {
            const index = typeof index_value === "number" ? index_value : 0;
            detail.setContent(format_option_detail(input.options[index]));
            screen.render();
        });
        list.key(["enter"], () => {
            const index = typeof list.selected === "number" ? list.selected : 0;
            finish(input.options[index]?.value);
        });
        screen.key(["escape", "q", "C-c"], () => finish(cancel("cancel")));
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
            hint: "Confirm this action",
        },
        {
            label: "No",
            value: false,
            hint: "Cancel and go back",
        },
    ];
    return await new Promise((resolve) => {
        const screen = create_screen(input.message);
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
            items: options.map((item) => item.label),
        });
        blessed.box({
            parent: screen,
            top: "center-6",
            left: "center",
            width: "60%",
            height: 3,
            align: "center",
            content: input.message,
        });
        create_footer(screen, "Enter choose · Esc cancel");
        list.select(initial_value ? 0 : 1);
        list.focus();
        list.key(["enter"], () => {
            const index = typeof list.selected === "number" ? list.selected : (initial_value ? 0 : 1);
            finish(options[index]?.value);
        });
        screen.key(["escape", "q", "C-c"], () => finish(cancel("cancel")));
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
        const submitted_value = await new Promise((resolve) => {
            const screen = create_screen(input.message);
            let finished = false;
            const finish = (value) => {
                if (finished)
                    return;
                finished = true;
                screen.destroy();
                resolve(value);
            };
            blessed.box({
                parent: screen,
                top: "center-6",
                left: "center",
                width: "70%",
                height: 3,
                align: "center",
                content: input.message,
            });
            blessed.box({
                parent: screen,
                top: "center-3",
                left: "center",
                width: "70%",
                height: 5,
                border: "line",
                label: secret ? " Secret " : " Input ",
                style: {
                    border: { fg: error_message ? "red" : "cyan" },
                },
            });
            if (error_message) {
                blessed.box({
                    parent: screen,
                    top: "center+2",
                    left: "center",
                    width: "70%",
                    height: 2,
                    align: "center",
                    style: {
                        fg: "red",
                    },
                    content: error_message,
                });
            }
            const textbox = blessed.textbox({
                parent: screen,
                top: "center-2",
                left: "center-34%",
                width: "66%",
                height: 1,
                inputOnFocus: true,
                keys: true,
                mouse: true,
                censor: secret,
                value: String(input.initialValue ?? input.placeholder ?? ""),
                style: {
                    fg: "white",
                    bg: "black",
                },
            });
            create_footer(screen, "Enter submit · Esc cancel");
            textbox.focus();
            textbox.readInput((error, value) => {
                if (error) {
                    finish(cancel("cancel"));
                    return;
                }
                finish(String(value ?? ""));
            });
            screen.key(["escape", "C-c"], () => finish(cancel("cancel")));
            screen.render();
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
            border: { fg: "cyan" },
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
            border: { fg: "cyan" },
            fg: "gray",
        },
        content,
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
function format_option_title(option) {
    const label = String(option?.label ?? "").trim();
    const hint = String(option?.hint ?? "").trim();
    return hint ? `${label}\n${hint}` : label;
}
function format_option_detail(option) {
    if (!option) {
        return "No item selected";
    }
    return [
        `{bold}${option.label}{/bold}`,
        option.hint ? option.hint : "",
        option.value !== undefined ? `\nvalue: ${String(option.value)}` : "",
    ].filter(Boolean).join("\n");
}
function cancel(reason) {
    return {
        __clack_cancel: true,
        reason,
    };
}
//# sourceMappingURL=Prompts.js.map