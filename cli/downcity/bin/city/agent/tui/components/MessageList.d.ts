/**
 * 消息流组件。
 *
 * 关键点（中文）
 * - 继承 GutterContainer（直接从 Kimi Code 挪用），给消息区左右留 1 列边距。
 * - 消息直接 append 为子组件，不在每条消息间固定插入 Spacer。
 * - 不维护固定视口高度，不手动切片；交给外层 TUI 统一裁剪顶部溢出。
 * - 对齐 Kimi Code 的 transcriptContainer 思路：消息自然向下生长，最新内容靠近底部输入区。
 */
import { GutterContainer } from "../../../../city/agent/tui/components/GutterContainer.js";
import type { TranscriptEntry } from "../../../../city/agent/tui/types.js";
/**
 * 消息流展示组件。
 */
export declare class MessageListComponent extends GutterContainer {
    private entries;
    private components;
    /**
     * 构造消息流组件。
     */
    constructor();
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
     * 清空所有消息。
     */
    clear(): void;
    /**
     * 获取当前条目数量。
     */
    get entry_count(): number;
    private create_component;
}
//# sourceMappingURL=MessageList.d.ts.map