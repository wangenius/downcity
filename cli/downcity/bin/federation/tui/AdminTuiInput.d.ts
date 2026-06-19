/**
 * Admin TUI 输入循环模块。
 *
 * 关键点（中文）
 * - 负责侧边栏选择、文本输入、密码输入的交互循环。
 * - 与 Render 模块配合：数据变更时调用 Render 刷新屏幕。
 */
import { type blessed_textbox_element, type shell_layout } from "./AdminTuiShell.js";
import type { admin_tui_select_option } from "../types/AdminTui.js";
/**
 * 运行侧边栏单选。
 */
export declare function run_sidebar_select(input: {
    shell: shell_layout;
    title: string;
    options: admin_tui_select_option[];
    initial_index: number;
    on_select_index: (index: number) => void;
    on_focus_option?: (option: admin_tui_select_option | undefined) => void;
}): Promise<string | undefined>;
/**
 * 在内容区运行文本/密码输入。
 */
export declare function run_text_in_content(shell: shell_layout, input: {
    title: string;
    placeholder?: string;
    secret: boolean;
    on_cleanup: (cleanup: () => void) => void;
}): Promise<string | undefined>;
export declare function resolve_selectable_index(options: admin_tui_select_option[], value: unknown, fallback: number): number;
export declare function next_breadcrumb_parts(current_parts: string[], section_title: string): string[];
export declare function clamp_selected_index(value: unknown, length: number, fallback: number): number;
export declare function get_key_name(key: unknown): string | undefined;
export declare function normalize_textbox_value(value: unknown): string;
export declare function submit_textbox_value(textbox: blessed_textbox_element, finish: () => void): void;
//# sourceMappingURL=AdminTuiInput.d.ts.map