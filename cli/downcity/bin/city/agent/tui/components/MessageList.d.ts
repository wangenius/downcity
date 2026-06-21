/**
 * 可滚动消息流组件。
 *
 * 关键点（中文）
 * - 内部使用 GutterContainer 保留左右边距。
 * - 维护 scroll_offset，支持 PageUp/PageDown 等快捷键回看历史。
 * - 默认贴底：scroll_offset 为 0 时始终显示最新内容。
 * - 用户向上滚动后，新追加的内容不应改变当前视口顶部位置。
 * - 消息顺序按 append 先后排列，最新内容在底部。
 */
import { type Component } from "@earendil-works/pi-tui";
import type { TranscriptEntry } from "../../../../city/agent/tui/types.js";
/**
 * 消息流构造选项。
 */
export interface MessageListOptions {
    /** 获取当前可视区高度（行数）。 */
    get_viewport_height: () => number;
}
/**
 * 可滚动消息流展示组件。
 */
export declare class MessageListComponent implements Component {
    private inner;
    private entries;
    private components;
    private scroll_offset;
    private last_rendered_line_count;
    private get_viewport_height_fn;
    /**
     * 构造可滚动消息流组件。
     *
     * @param options 构造选项。
     */
    constructor(options: MessageListOptions);
    /**
     * 内部子组件列表，供 coordinator 查找 tool block。
     */
    get children(): readonly Component[];
    /**
     * 当前滚动偏移（0 表示贴底）。
     */
    get current_scroll_offset(): number;
    /**
     * 添加一条消息条目。
     *
     * @param entry 新条目。
     */
    add_entry(entry: TranscriptEntry): void;
    /**
     * 更新指定 assistant 条目的文本。
     *
     * @param entry_id 目标条目 ID。
     * @param text 新文本。
     * @param streaming 是否仍在流式输出中。
     */
    update_assistant_text(entry_id: string, text: string, streaming: boolean): void;
    /**
     * 注入指定 tool 调用的执行结果。
     *
     * @param tool_call_id tool 调用唯一标识。
     * @param result tool 返回结果。
     */
    update_tool_result(tool_call_id: string, result: unknown): void;
    /**
     * 清空所有消息。
     */
    clear(): void;
    /**
     * 获取当前条目数量。
     */
    get entry_count(): number;
    /**
     * 按行数滚动。
     *
     * @param delta 正数向上（看历史），负数向下（回底部方向）。
     */
    scroll_by(delta: number): void;
    /**
     * 滚动到底部（follow-tail）。
     */
    scroll_to_bottom(): void;
    /**
     * 切换当前是否贴底。
     *
     * @returns 切换后是否贴底。
     */
    toggle_follow_tail(): boolean;
    /**
     * 渲染消息流。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
    /**
     * 通知内部组件主题已变化。
     */
    invalidate(): void;
    private create_component;
}
//# sourceMappingURL=MessageList.d.ts.map