/**
 * Admin TUI Shell 布局创建模块。
 *
 * 关键点（中文）
 * - 负责 blessed screen、侧边栏、内容区、底部 footer 的初始布局。
 * - 暴露 shell_layout 与 blessed 元素类型扩展，供 Render / Input / Runtime 复用。
 */
import blessed from "neo-blessed";
import { t } from "../../shared/CliLocale.js";
/**
 * 创建 admin TUI 完整布局。
 */
export function create_shell(title) {
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
/**
 * 格式化面包屑文本。
 */
export function format_breadcrumb(title) {
    return title.padEnd(80, " ");
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
/**
 * 判断是否为纯 Esc 输入。
 */
export function is_plain_escape_input(text) {
    return text === "\u001b";
}
//# sourceMappingURL=AdminTuiShell.js.map