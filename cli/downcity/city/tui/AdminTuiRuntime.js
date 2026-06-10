/**
 * Admin 单屏 TUI Shell 运行时。
 *
 * 关键说明（中文）
 * - Admin 启动后只创建一个 blessed screen，除退出外不再跳出全屏应用模式。
 * - 左侧 sidebar 承载所有菜单层级，右侧 section 只承载 loading、文本、JSON、消息与输入。
 */
import blessed from "neo-blessed";
import { t } from "../i18n.js";
/**
 * 创建 admin TUI runtime。
 */
export function create_admin_tui_runtime(title = "Admin") {
    const shell = create_shell(title);
    let active_main_cleanup;
    let breadcrumb_parts = [title];
    const selected_index_by_breadcrumb = new Map();
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
            breadcrumb_parts = [nav_title];
            const breadcrumb_key = nav_title;
            const selected_index = clamp_selected_index(selected_index_by_breadcrumb.get(breadcrumb_key), options.length, 0);
            render_nav(shell, nav_title, options, selected_index);
            render_idle(shell, t({
                zh: "选择左侧管理项",
                en: "Select an item from the sidebar",
            }));
            return await run_sidebar_select({
                shell,
                title: nav_title,
                options,
                initial_index: selected_index,
                on_select_index: (index) => selected_index_by_breadcrumb.set(breadcrumb_key, index),
            });
        },
        async select(section_title, options) {
            breadcrumb_parts = next_breadcrumb_parts(breadcrumb_parts, section_title);
            const breadcrumb_key = breadcrumb_parts.join(" / ");
            const selected_index = clamp_selected_index(selected_index_by_breadcrumb.get(breadcrumb_key), options.length, 0);
            render_nav(shell, breadcrumb_key, options, selected_index);
            if (shell.content_box.children.length === 0) {
                render_idle(shell, t({
                    zh: "选择左侧管理项",
                    en: "Select an item from the sidebar",
                }));
            }
            return await run_sidebar_select({
                shell,
                title: section_title,
                options,
                initial_index: selected_index,
                on_select_index: (index) => selected_index_by_breadcrumb.set(breadcrumb_key, index),
            });
        },
        async text(section_title, placeholder) {
            cleanup_main();
            render_footer(text_footer_text(false));
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
            render_footer(text_footer_text(true));
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
            render_footer(t({
                zh: "加载中...",
                en: "Loading...",
            }));
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
                : [[input.empty_message ?? t({ zh: "暂无数据", en: "No data" })]];
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
        label: ` ${t({ zh: "侧边栏", en: "Sidebar" })} `,
        style: {
            border: { fg: "cyan" },
        },
    });
    const breadcrumb_box = blessed.box({
        parent: nav_box,
        top: 0,
        left: 1,
        width: "100%-2",
        height: 2,
        tags: false,
        content: format_breadcrumb(title),
        style: {
            fg: "cyan",
            bold: true,
        },
    });
    const nav_list = blessed.list({
        parent: nav_box,
        top: 2,
        left: 0,
        width: "100%",
        height: "100%-2",
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
        label: ` ${t({ zh: "内容", en: "Section" })} `,
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
    return { screen, nav_box, breadcrumb_box, nav_list, content_box, footer_box };
}
function render_nav(shell, title, options, selected_index) {
    shell.breadcrumb_box.setContent(format_breadcrumb(title));
    shell.nav_list.setItems(options.map(format_sidebar_option));
    shell.nav_list.select(selected_index);
    render_sidebar_hint(shell, options, selected_index);
    shell.screen.render();
}
function render_idle(shell, message) {
    shell.content_box.setLabel(` ${t({ zh: "内容", en: "Section" })} `);
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
        let selected_index = clamp_selected_index(input.initial_index, input.options.length, 0);
        const keypress_listener = (_ch, key) => {
            const key_name = get_key_name(key);
            if (key_name === "enter") {
                finish(input.options[selected_index]?.value);
            }
            if (key_name === "escape" || key_name === "q" || key_name === "C-c") {
                finish(undefined);
            }
            setImmediate(() => {
                selected_index = clamp_selected_index(list.selected, input.options.length, selected_index);
                input.on_select_index(selected_index);
                render_sidebar_hint(input.shell, input.options, selected_index);
            });
        };
        const select_item_listener = (_item, index_value) => {
            selected_index = clamp_selected_index(index_value, input.options.length, selected_index);
            input.on_select_index(selected_index);
            render_sidebar_hint(input.shell, input.options, selected_index);
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
        input.on_select_index(selected_index);
        render_sidebar_hint(input.shell, input.options, selected_index);
        list.on("keypress", keypress_listener);
        list.on("select item", select_item_listener);
        raw_input_listener = (chunk) => {
            const text = String(chunk);
            if (text.includes("\u0003") || is_plain_escape_input(text)) {
                finish(undefined);
                return;
            }
            if (text.includes("\r") || text.includes("\n")) {
                finish(input.options[selected_index]?.value);
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
        content: t({
            zh: `正在加载 ${title}...`,
            en: `Loading ${title}...`,
        }),
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
            content: input.content || t({ zh: "（空）", en: "(empty)" }),
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
        shell.footer_box.setContent(t({
            zh: "Enter / Esc 返回 · ↑↓ 滚动 · q 返回",
            en: "Enter / Esc back · ↑↓ scroll · q back",
        }));
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
function render_sidebar_hint(shell, options, selected) {
    const option = options[typeof selected === "number" ? selected : 0];
    const hint = option ? ` · ${option_description(option)}` : "";
    shell.footer_box.setContent(`${t({
        zh: "Enter 选择 · Esc / q 返回 · ↑↓ 切换",
        en: "Enter choose · Esc / q back · ↑↓ navigate",
    })}${hint}`);
    shell.screen.render();
}
function format_sidebar_option(option) {
    return `${option.label}  ·  ${option_description(option)}`;
}
function option_description(option) {
    const explicit_hint = String(option.hint ?? "").trim();
    if (explicit_hint)
        return explicit_hint;
    return t({
        zh: `选择 ${option.label}`,
        en: `Select ${option.label}`,
    });
}
function next_breadcrumb_parts(current_parts, section_title) {
    const normalized_title = section_title.trim();
    if (!normalized_title)
        return current_parts;
    const existing_index = current_parts.indexOf(normalized_title);
    if (existing_index >= 0) {
        return current_parts.slice(0, existing_index + 1);
    }
    return [...current_parts, normalized_title];
}
function format_breadcrumb(title) {
    return title.padEnd(80, " ");
}
function clamp_selected_index(value, length, fallback) {
    if (length <= 0)
        return 0;
    const index = typeof value === "number" && Number.isInteger(value) ? value : fallback;
    return Math.max(0, Math.min(length - 1, index));
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
        return t({ zh: "成功", en: "Success" });
    if (kind === "error")
        return t({ zh: "错误", en: "Error" });
    return t({ zh: "信息", en: "Info" });
}
/**
 * 输入态 footer 文案。
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