/**
 * Downcity CLI 通用 TUI Shell。
 *
 * 关键说明（中文）
 * - 统一 `city` 顶层 dashboard、通用 prompts、后续 runtime 的两栏布局。
 * - 左侧 sidebar 承载菜单层级与 breadcrumb，右侧 main_section 只展示内容、详情、输入和状态。
 * - 所有调用方共享同一套颜色、footer、breadcrumb 清屏规则，避免 blessed 细节散落。
 */
import blessed from "neo-blessed";
/**
 * TUI Shell 配置。
 */
export interface tui_shell_input {
    /** 当前 screen 标题，会显示在终端标题栏。 */
    screen_title: string;
    /** sidebar 顶部 breadcrumb 文案。 */
    breadcrumb: string;
    /** main section 边框标题。 */
    main_label?: string;
    /** footer 操作提示文案。 */
    footer?: string;
}
/**
 * TUI Shell 实例。
 */
export interface tui_shell {
    /** blessed 全屏根节点。 */
    screen: blessed.Widgets.Screen;
    /** 左侧 sidebar 容器。 */
    sidebar_box: blessed.Widgets.BoxElement;
    /** sidebar 顶部 breadcrumb。 */
    breadcrumb_box: blessed.Widgets.BoxElement;
    /** 右侧主内容区。 */
    main_box: blessed.Widgets.BoxElement;
    /** 底部 footer 容器。 */
    footer_box: blessed.Widgets.BoxElement;
    /** 更新 breadcrumb，自动填充尾部空白避免残影。 */
    set_breadcrumb: (value: string) => void;
    /** 更新 footer。 */
    set_footer: (value: string) => void;
}
/**
 * 创建 Downcity CLI 通用 TUI Shell。
 */
export declare function create_tui_shell(input: tui_shell_input): tui_shell;
/**
 * 格式化 breadcrumb，避免 blessed 从长文案切短文案时留下残影。
 */
export declare function format_breadcrumb(value: string): string;
//# sourceMappingURL=Shell.d.ts.map