/**
 * Admin TUI 渲染辅助模块。
 *
 * 关键点（中文）
 * - 负责选项列表、内容区、loading、消息、表格的渲染。
 * - 不处理输入循环，只根据数据刷新屏幕。
 */
import { type shell_layout } from "../../federation/tui/AdminTuiShell.js";
import type { admin_tui_message_kind, admin_tui_select_option } from "../../federation/types/AdminTui.js";
/**
 * 渲染侧边栏选项列表。
 */
export declare function render_nav(shell: shell_layout, title: string, options: admin_tui_select_option[], selected_index: number): void;
/**
 * 渲染当前选项详情到内容区。
 */
export declare function render_option_detail(shell: shell_layout, title: string, option: admin_tui_select_option | undefined): void;
/**
 * 渲染 loading 状态。
 */
export declare function render_loading(shell: shell_layout, title: string): void;
/**
 * 在内容区展示一段文本。
 */
export declare function show_content(shell: shell_layout, input: {
    title: string;
    content: string;
    accent: "cyan" | "green" | "red";
    on_cleanup: (cleanup: () => void) => void;
}): Promise<void>;
/**
 * 渲染底部提示条。
 */
export declare function render_sidebar_hint(shell: shell_layout, options: admin_tui_select_option[], selected: number | undefined): void;
export declare function format_sidebar_option(option: admin_tui_select_option): string;
export declare function format_option_detail(title: string, option: admin_tui_select_option | undefined): string;
export declare function option_description(option: admin_tui_select_option): string;
export declare function is_disabled_option(option: admin_tui_select_option | undefined): boolean;
export declare function format_table(rows: string[][]): string;
export declare function message_title(kind: admin_tui_message_kind): string;
/**
 * 输入态 footer 文案。
 */
export declare function text_footer_text(secret: boolean): string;
export declare function message_accent(kind: admin_tui_message_kind): "cyan" | "green" | "red";
//# sourceMappingURL=AdminTuiRender.d.ts.map