/**
 * 消息流组件。
 *
 * 关键点（中文）
 * - 管理所有 TranscriptEntry 到 pi-tui 组件的映射。
 * - 负责视口滚动，新消息自动滚到底部。
 * - 支持更新 assistant 流式文本。
 */
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { current_theme } from "../theme/index.js";
import { AssistantMessageComponent } from "./AssistantMessage.js";
import { ToolCallBlockComponent } from "./ToolCallBlock.js";
import { UserMessageComponent } from "./UserMessage.js";
/**
 * 消息流展示组件。
 */
export class MessageListComponent {
    entries = [];
    components = new Map();
    available_height = 0;
    scroll_offset = 0;
    spacer = new Spacer(1);
    /**
     * 清理组件缓存（主题切换时调用）。
     */
    invalidate() {
        for (const component of this.components.values()) {
            component.invalidate();
        }
    }
    /**
     * 设置视口高度。
     *
     * @param height 可用高度（行数）。
     */
    set_available_height(height) {
        this.available_height = Math.max(0, height);
    }
    /**
     * 获取当前条目数量。
     */
    get entry_count() {
        return this.entries.length;
    }
    /**
     * 添加一条消息条目。
     *
     * @param entry 新条目。
     */
    add_entry(entry) {
        this.entries.push(entry);
        this.components.set(entry.id, this.create_component(entry));
        this.scroll_to_bottom();
    }
    /**
     * 更新指定 assistant 条目的文本。
     *
     * @param entry_id 目标条目 ID。
     * @param text 新文本。
     * @param streaming 是否仍在流式输出中。
     */
    update_assistant_text(entry_id, text, streaming) {
        const entry = this.entries.find((item) => item.id === entry_id);
        if (!entry || entry.kind !== "assistant") {
            return;
        }
        entry.text = text;
        entry.streaming = streaming;
        const component = this.components.get(entry_id);
        if (component instanceof AssistantMessageComponent) {
            component.update_content(text);
        }
        this.scroll_to_bottom();
    }
    /**
    * 滚动到消息流底部。
    */
    scroll_to_bottom() {
        this.scroll_offset = Infinity;
    }
    /**
     * 清空所有消息。
     */
    clear() {
        this.entries = [];
        this.components.clear();
        this.scroll_offset = 0;
    }
    /**
     * 渲染视口内的消息。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width) {
        const safe_width = Math.max(0, width);
        if (safe_width <= 0 || this.available_height <= 0) {
            return [];
        }
        const all_lines = [];
        for (const line of this.spacer.render(safe_width)) {
            all_lines.push(line);
        }
        for (const entry of this.entries) {
            const component = this.components.get(entry.id);
            if (!component) {
                continue;
            }
            const rendered = component.render(safe_width);
            for (const line of rendered) {
                all_lines.push(line);
            }
        }
        const max_offset = Math.max(0, all_lines.length - this.available_height);
        if (this.scroll_offset === Infinity) {
            this.scroll_offset = max_offset;
        }
        this.scroll_offset = Math.min(this.scroll_offset, max_offset);
        return all_lines.slice(this.scroll_offset, this.scroll_offset + this.available_height);
    }
    create_component(entry) {
        switch (entry.kind) {
            case "user":
                return new UserMessageComponent(entry.text);
            case "assistant":
                return new AssistantMessageComponent(true);
            case "tool-call":
            case "tool-result":
            case "tool-approval-request":
            case "tool-approval-result":
                return new ToolCallBlockComponent(entry);
            case "status":
                return new Text(`  ${current_theme.fg("textDim", entry.text)}`, 0, 0);
            case "error":
                return new Text(`  ${current_theme.fg("error", entry.text)}`, 0, 0);
            default:
                return new Container();
        }
    }
}
//# sourceMappingURL=MessageList.js.map