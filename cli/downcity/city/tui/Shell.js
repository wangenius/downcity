/**
 * City CLI 通用 TUI Shell。
 *
 * 关键说明（中文）
 * - 统一 `city` 顶层 dashboard、通用 prompts、后续 runtime 的两栏布局。
 * - 左侧 sidebar 承载菜单层级与 breadcrumb，右侧 main_section 只展示内容、详情、输入和状态。
 * - 所有调用方共享同一套颜色、footer、breadcrumb 清屏规则，避免 blessed 细节散落。
 */
import blessed from "neo-blessed";
import { t } from "../i18n.js";
/**
 * 创建 City CLI 通用 TUI Shell。
 */
export function create_city_tui_shell(input) {
    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        title: input.screen_title,
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
            border: { fg: "cyan" },
        },
    });
    const breadcrumb_box = blessed.box({
        parent: sidebar_box,
        top: 0,
        left: 1,
        width: "100%-2",
        height: 2,
        content: format_breadcrumb(input.breadcrumb),
        style: {
            fg: "cyan",
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
        label: ` ${input.main_label ?? t({ zh: "主区域", en: "Main" })} `,
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
        padding: { left: 1, right: 1, top: 1 },
        style: {
            border: { fg: "cyan" },
            fg: "gray",
        },
        content: input.footer ?? "",
    });
    const shell = {
        screen,
        sidebar_box,
        breadcrumb_box,
        main_box,
        footer_box,
        set_breadcrumb(value) {
            breadcrumb_box.setContent(format_breadcrumb(value));
            screen.render();
        },
        set_footer(value) {
            footer_box.setContent(value);
            screen.render();
        },
    };
    return shell;
}
/**
 * 格式化 breadcrumb，避免 blessed 从长文案切短文案时留下残影。
 */
export function format_breadcrumb(value) {
    return String(value ?? "").padEnd(80, " ");
}
//# sourceMappingURL=Shell.js.map