/**
 * Admin 单屏 TUI Shell 运行时。
 *
 * 关键说明（中文）
 * - Admin 启动后只创建一个 blessed screen，除退出外不再跳出全屏应用模式。
 * - 左侧为稳定导航区，右侧 section 承载 loading、列表、文本、JSON、消息与输入。
 */
import blessed from "neo-blessed";
/**
 * 创建 admin TUI runtime。
 */
export function create_admin_tui_runtime(title = "Admin") {
    const shell = create_shell(title);
    let active_main_cleanup;
    const cleanup_main = () => {
        if (active_main_cleanup) {
            active_main_cleanup();
            active_main_cleanup = undefined;
        }
        shell.content_box.children.slice().forEach((child) => child.destroy());
    };
    const render_footer = (content) => {
        shell.footer_box.setContent(content);
    };
    const runtime = {
        close() {
            cleanup_main();
            shell.screen.destroy();
        },
        async select_nav(nav_title, options) {
            cleanup_main();
            render_nav(shell, nav_title, options);
            render_idle(shell, "选择左侧管理项");
            render_footer("Enter choose · Esc / q back · ↑↓ navigate");
            return await run_sidebar_select({
                shell,
                title: nav_title,
                options,
            });
        },
        async select(section_title, options) {
            cleanup_main();
            render_footer("Enter choose · Esc / q back · ↑↓ navigate");
            return await run_main_select({
                shell,
                title: section_title,
                options,
                on_cleanup: (cleanup) => {
                    active_main_cleanup = cleanup;
                },
            });
        },
        async text(section_title, placeholder) {
            cleanup_main();
            render_footer("Type text · Enter submit · Esc cancel · Ctrl+U clear");
            return await run_text_in_content(shell, {
                title: section_title,
                placeholder,
                secret: false,
                on_cleanup: (cleanup) => {
                    active_main_cleanup = cleanup;
                },
            });
        },
        async password(section_title, placeholder) {
            cleanup_main();
            render_footer("Type secret · Enter submit · Esc cancel · Ctrl+U clear");
            return await run_text_in_content(shell, {
                title: section_title,
                placeholder,
                secret: true,
                on_cleanup: (cleanup) => {
                    active_main_cleanup = cleanup;
                },
            });
        },
        async with_loading(section_title, task) {
            cleanup_main();
            render_loading(shell, section_title);
            render_footer("Loading...");
            shell.screen.render();
            try {
                return await task();
            }
            finally {
                cleanup_main();
            }
        },
        async show_text(section_title, content) {
            await show_content(shell, {
                title: section_title,
                content: String(content || ""),
                accent: "cyan",
                on_cleanup: (cleanup) => {
                    active_main_cleanup = cleanup;
                },
            });
        },
        async show_table(input) {
            const rows = input.rows.length > 0
                ? [input.columns, ...input.rows.map((row) => row.cells)]
                : [[input.empty_message ?? "No data"]];
            await show_content(shell, {
                title: input.title,
                content: format_table(rows),
                accent: "cyan",
                on_cleanup: (cleanup) => {
                    active_main_cleanup = cleanup;
                },
            });
        },
        async show_json(section_title, data) {
            await show_content(shell, {
                title: section_title,
                content: JSON.stringify(data, null, 2),
                accent: "cyan",
                on_cleanup: (cleanup) => {
                    active_main_cleanup = cleanup;
                },
            });
        },
        async show_message(kind, message) {
            await show_content(shell, {
                title: message_title(kind),
                content: message,
                accent: message_accent(kind),
                on_cleanup: (cleanup) => {
                    active_main_cleanup = cleanup;
                },
            });
        },
    };
    return runtime;
}
function create_shell(title) {
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
    const nav_box = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: "34%",
        height: "100%-3",
        border: "line",
        label: " Admin ",
        style: {
            border: { fg: "cyan" },
        },
    });
    const nav_list = blessed.list({
        parent: nav_box,
        top: 1,
        left: 0,
        width: "100%",
        height: "100%-1",
        keys: true,
        vi: true,
        mouse: true,
        items: [],
        style: build_list_style(),
    });
    const content_box = blessed.box({
        parent: screen,
        top: 0,
        left: "34%",
        width: "66%",
        height: "100%-3",
        border: "line",
        label: " Section ",
        style: {
            border: { fg: "cyan" },
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
            border: { fg: "cyan" },
            fg: "gray",
        },
        content: "",
    });
    screen.render();
    return { screen, nav_box, nav_list, content_box, footer_box };
}
function render_nav(shell, title, options) {
    shell.nav_box.setLabel(` ${title} `);
    shell.nav_list.setItems(options.map((item) => item.label));
    shell.nav_list.select(0);
}
function render_idle(shell, message) {
    shell.content_box.setLabel(" Section ");
    blessed.box({
        parent: shell.content_box,
        top: "center",
        left: "center",
        width: "80%",
        height: 5,
        align: "center",
        valign: "middle",
        content: message,
        style: {
            fg: "gray",
        },
    });
    shell.screen.render();
}
async function run_sidebar_select(input) {
    return await new Promise((resolve) => {
        let finished = false;
        let raw_input_listener;
        const list = input.shell.nav_list;
        const keypress_listener = (_ch, key) => {
            const key_name = get_key_name(key);
            if (key_name === "enter") {
                const index = typeof list.selected === "number" ? list.selected : 0;
                finish(input.options[index]?.value);
            }
            if (key_name === "escape" || key_name === "q" || key_name === "C-c") {
                finish(undefined);
            }
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
        };
        list.select(0);
        list.focus();
        list.on("keypress", keypress_listener);
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(undefined);
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                const index = typeof list.selected === "number" ? list.selected : 0;
                finish(input.options[index]?.value);
            }
        };
        process.stdin.on("data", raw_input_listener);
        input.shell.screen.render();
    });
}
async function run_main_select(input) {
    return await new Promise((resolve) => {
        input.shell.content_box.setLabel(` ${input.title} `);
        let finished = false;
        let raw_input_listener;
        blessed.box({
            parent: input.shell.content_box,
            top: 1,
            left: 1,
            width: "100%-2",
            height: 2,
            tags: true,
            content: `{bold}${input.title}{/bold}`,
        });
        const list = blessed.list({
            parent: input.shell.content_box,
            top: 3,
            left: 1,
            width: "100%-2",
            height: "100%-4",
            keys: true,
            vi: true,
            mouse: true,
            items: input.options.map(format_main_option),
            style: build_list_style(),
        });
        const keypress_listener = (_ch, key) => {
            const key_name = get_key_name(key);
            if (key_name === "enter") {
                const index = typeof list.selected === "number" ? list.selected : 0;
                finish(input.options[index]?.value);
            }
            if (key_name === "escape" || key_name === "q" || key_name === "C-c") {
                finish(undefined);
            }
            setImmediate(() => render_main_hint(input.shell, input.options, list.selected));
        };
        const finish = (value) => {
            if (finished)
                return;
            finished = true;
            cleanup_input();
            resolve(value);
        };
        const cleanup_input = () => {
            if (raw_input_listener) {
                process.stdin.off("data", raw_input_listener);
                raw_input_listener = undefined;
            }
            list.removeListener("keypress", keypress_listener);
        };
        const cleanup = () => {
            cleanup_input();
            list.destroy();
        };
        input.on_cleanup(cleanup);
        list.select(0);
        list.focus();
        list.on("keypress", keypress_listener);
        render_main_hint(input.shell, input.options, list.selected);
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(undefined);
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                const index = typeof list.selected === "number" ? list.selected : 0;
                finish(input.options[index]?.value);
            }
        };
        process.stdin.on("data", raw_input_listener);
        input.shell.screen.render();
    });
}
async function run_text_in_content(shell, input) {
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
            label: input.secret ? " Secret " : " Input ",
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
            content: input.placeholder ? `placeholder: ${input.placeholder}` : "",
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
function render_loading(shell, title) {
    shell.content_box.setLabel(` ${title} `);
    blessed.box({
        parent: shell.content_box,
        top: "center",
        left: "center",
        width: "80%",
        height: 5,
        align: "center",
        valign: "middle",
        border: "line",
        content: `Loading ${title}...`,
        style: {
            border: { fg: "cyan" },
            fg: "white",
        },
    });
}
async function show_content(shell, input) {
    return await new Promise((resolve) => {
        shell.content_box.children.slice().forEach((child) => child.destroy());
        shell.content_box.setLabel(` ${input.title} `);
        let finished = false;
        let raw_input_listener;
        const content_box = blessed.box({
            parent: shell.content_box,
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            padding: { left: 1, right: 1, top: 1, bottom: 1 },
            tags: false,
            scrollable: true,
            alwaysScroll: true,
            keys: true,
            vi: true,
            mouse: true,
            content: input.content || "(empty)",
            style: {
                fg: "white",
                border: { fg: input.accent },
            },
        });
        const finish = () => {
            if (finished)
                return;
            finished = true;
            if (raw_input_listener) {
                process.stdin.off("data", raw_input_listener);
            }
            resolve();
        };
        const cleanup = () => {
            if (raw_input_listener) {
                process.stdin.off("data", raw_input_listener);
                raw_input_listener = undefined;
            }
            content_box.destroy();
        };
        input.on_cleanup(cleanup);
        content_box.focus();
        if (typeof content_box.setScrollPerc === "function") {
            content_box.setScrollPerc(0);
        }
        shell.footer_box.setContent("Enter / Esc back · ↑↓ scroll · q back");
        content_box.key(["enter", "escape", "q", "C-c"], finish);
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || text.includes("\r") || text.includes("\n") || is_plain_escape_input(text)) {
                finish();
            }
        };
        process.stdin.on("data", raw_input_listener);
        shell.screen.render();
    });
}
function build_list_style() {
    return {
        item: { fg: "white" },
        selected: {
            fg: "black",
            bg: "cyan",
            bold: true,
        },
    };
}
function format_main_option(option) {
    return option.label;
}
function render_main_hint(shell, options, selected) {
    const option = options[typeof selected === "number" ? selected : 0];
    const hint = option?.hint ? ` · ${option.hint}` : "";
    shell.footer_box.setContent(`Enter choose · Esc / q back · ↑↓ navigate${hint}`);
    shell.screen.render();
}
function get_key_name(key) {
    if (!key || typeof key !== "object")
        return undefined;
    const candidate = key;
    if (typeof candidate.full === "string")
        return candidate.full;
    if (typeof candidate.name === "string")
        return candidate.name;
    return undefined;
}
function format_table(rows) {
    if (rows.length === 0) {
        return "";
    }
    const widths = rows[0].map((_cell, index) => {
        return Math.min(36, Math.max(...rows.map((row) => visible_width(row[index] ?? "")), 3));
    });
    return rows
        .map((row, row_index) => {
        const line = row
            .map((cell, index) => pad_cell(cell, widths[index] ?? 12))
            .join("  ");
        if (row_index === 0 && rows.length > 1) {
            const rule = widths.map((width) => "-".repeat(width)).join("  ");
            return `${line}\n${rule}`;
        }
        return line;
    })
        .join("\n");
}
function pad_cell(value, width) {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    const clipped = visible_width(normalized) > width
        ? `${normalized.slice(0, Math.max(0, width - 1))}…`
        : normalized;
    return clipped.padEnd(width, " ");
}
function visible_width(value) {
    return String(value ?? "").length;
}
function message_title(kind) {
    if (kind === "success")
        return "Success";
    if (kind === "error")
        return "Error";
    return "Info";
}
function message_accent(kind) {
    if (kind === "success")
        return "green";
    if (kind === "error")
        return "red";
    return "cyan";
}
function normalize_textbox_value(value) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
}
function submit_textbox_value(textbox, finish) {
    if (textbox._done) {
        textbox._done("stop");
    }
    finish();
}
function is_plain_escape_input(text) {
    return text === "\u001b";
}
//# sourceMappingURL=AdminTuiRuntime.js.map