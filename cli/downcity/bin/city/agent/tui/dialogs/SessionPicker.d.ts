/**
 * Session 选择器弹窗。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code DESIGN.md 的列表 dialog 规范。
 * - 顶部/底部使用 primary 色平直边框 `─`。
 * - 选中指针为 `❯ `，当前项行尾标记 ` ← current`。
 * - 支持实时搜索：有 query 时显示 Search 行，Esc 先清 query 再取消。
 */
import { type Component, type Focusable } from "@earendil-works/pi-tui";
import type { AgentChatSessionSummaryView } from "../../../../city/agent/AgentChatTypes.js";
/**
 * Session 选择结果。
 */
export interface SessionPickerResult {
    /** 结果类型。 */
    kind: "create" | "session";
    /** 选中的 sessionId，create 时为 undefined。 */
    sessionId?: string;
}
/**
 * Session 选择器。
 */
export declare class SessionPickerComponent implements Component, Focusable {
    private items;
    private filtered_items;
    private current_session_id;
    private selected_index;
    private query;
    private max_visible;
    private on_select;
    private on_cancel;
    focused: boolean;
    /**
     * @param sessions 远程 session 摘要列表。
     * @param current_session_id 当前生效的 sessionId。
     * @param on_select 选中回调。
     * @param on_cancel 取消回调。
     * @param max_visible 最大可见项数。
     */
    constructor(params: {
        sessions: AgentChatSessionSummaryView[];
        current_session_id: string;
        on_select: (result: SessionPickerResult) => void;
        on_cancel: () => void;
        max_visible?: number;
    });
    /**
     * 刷新列表数据。
     *
     * @param sessions 新的 session 列表。
     * @param current_session_id 当前 sessionId。
     */
    refresh(sessions: AgentChatSessionSummaryView[], current_session_id: string): void;
    /**
     * 无缓存需要清理。
     */
    invalidate(): void;
    /**
     * 处理键盘输入。
     *
     * @param data pi-tui 输入数据。
     */
    handleInput(data: string): void;
    /**
     * 渲染选择器弹窗。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
    private build_items;
    private build_session_description;
    private apply_filter;
    private get_visible_items;
    private move_selection;
    private confirm_selection;
    private render_title;
    private render_hint;
    private render_query;
    private render_item;
    private render_scroll_info;
    private decode_printable_char;
}
//# sourceMappingURL=SessionPicker.d.ts.map