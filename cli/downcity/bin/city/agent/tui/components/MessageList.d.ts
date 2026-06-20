/**
 * 消息流组件。
 *
 * 关键点（中文）
 * - 管理所有 TranscriptEntry 到 pi-tui 组件的映射。
 * - 负责视口滚动，新消息自动滚到底部。
 * - 支持更新 assistant 流式文本。
 */
import { type Component } from "@earendil-works/pi-tui";
import type { TranscriptEntry } from "../../../../city/agent/tui/types.js";
/**
 * 消息流展示组件。
 */
export declare class MessageListComponent implements Component {
    private entries;
    private components;
    private available_height;
    private scroll_offset;
    private readonly spacer;
    /**
     * 清理组件缓存（主题切换时调用）。
     */
    invalidate(): void;
    /**
     * 设置视口高度。
     *
     * @param height 可用高度（行数）。
     */
    set_available_height(height: number): void;
    /**
     * 获取当前条目数量。
     */
    get entry_count(): number;
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
    * 滚动到消息流底部。
    */
    scroll_to_bottom(): void;
    /**
     * 清空所有消息。
     */
    clear(): void;
    /**
     * 渲染视口内的消息。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
    private create_component;
}
//# sourceMappingURL=MessageList.d.ts.map