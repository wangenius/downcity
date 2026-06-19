/**
 * Admin TUI Shell 布局创建模块。
 *
 * 关键点（中文）
 * - 负责 blessed screen、侧边栏、内容区、底部 footer 的初始布局。
 * - 暴露 shell_layout 与 blessed 元素类型扩展，供 Render / Input / Runtime 复用。
 */
import blessed from "neo-blessed";
export interface blessed_box_element extends blessed.Widgets.BoxElement {
    focus: () => void;
    destroy: () => void;
    setScrollPerc?: (percentage: number) => void;
    key: (keys: string | string[], listener: (...args: unknown[]) => void) => blessed_box_element;
}
export interface blessed_list_element extends blessed.Widgets.ListElement {
    on: (event: string, listener: (...args: unknown[]) => void) => blessed_list_element;
    removeListener: (event: string, listener: (...args: unknown[]) => void) => blessed_list_element;
    key: (keys: string | string[], listener: (...args: unknown[]) => void) => blessed_list_element;
    focus: () => void;
    destroy: () => void;
    select: (index: number) => void;
    setItems: (items: blessed.Widgets.ListElementItem[]) => void;
    selected?: number;
}
export interface blessed_textbox_element extends blessed.Widgets.TextboxElement {
    key: (keys: string | string[], listener: (...args: unknown[]) => void) => blessed_textbox_element;
    focus: () => void;
    destroy: () => void;
    readInput: (callback: (error: Error | null, value?: string) => void) => void;
    clearValue: () => void;
    getValue: () => string;
    _done?: (error: Error | string | null, value?: string | null) => void;
}
export interface shell_layout {
    /** blessed 全屏根节点。 */
    screen: blessed.Widgets.Screen;
    /** 左侧导航容器。 */
    nav_box: blessed.Widgets.BoxElement;
    /** 面包屑容器。 */
    breadcrumb_box: blessed.Widgets.BoxElement;
    /** 左侧选项列表。 */
    nav_list: blessed_list_element;
    /** 右侧内容容器。 */
    content_box: blessed.Widgets.BoxElement;
    /** 底部提示容器。 */
    footer_box: blessed.Widgets.BoxElement;
}
/**
 * 创建 admin TUI 完整布局。
 */
export declare function create_shell(title: string): shell_layout;
/**
 * 格式化面包屑文本。
 */
export declare function format_breadcrumb(title: string): string;
/**
 * 判断是否为纯 Esc 输入。
 */
export declare function is_plain_escape_input(text: string): boolean;
//# sourceMappingURL=AdminTuiShell.d.ts.map