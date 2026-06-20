/**
 * 消息流组件。
 *
 * 关键点（中文）
 * - 继承 GutterContainer（直接从 Kimi Code 挪用），给消息区左右留 1 列边距。
 * - 消息直接 append 为子组件，不在每条消息间固定插入 Spacer。
 * - 不维护固定视口高度，不手动切片；交给外层 TUI 统一裁剪顶部溢出。
 * - 对齐 Kimi Code 的 transcriptContainer 思路：消息自然向下生长，最新内容靠近底部输入区。
 */
import { Text } from "@earendil-works/pi-tui";
import { GutterContainer } from "../../../../city/agent/tui/components/GutterContainer.js";
import { CHROME_GUTTER } from "../../../../city/agent/tui/constant/rendering.js";
import { AssistantMessageComponent } from "../../../../city/agent/tui/components/AssistantMessage.js";
import { ToolCallBlockComponent } from "../../../../city/agent/tui/components/ToolCallBlock.js";
import { UserMessageComponent } from "../../../../city/agent/tui/components/UserMessage.js";
import { current_theme } from "../../../../city/agent/tui/theme/index.js";
/**
 * 消息流展示组件。
 */
export class MessageListComponent extends GutterContainer {
    entries = [];
    components = new Map();
    /**
     * 构造消息流组件。
     */
    constructor() {
        super(CHROME_GUTTER, CHROME_GUTTER);
    }
    /**
     * 添加一条消息条目。
     *
     * @param entry 新条目。
     */
    add_entry(entry) {
        this.entries.push(entry);
        const component = this.create_component(entry);
        this.components.set(entry.id, component);
        this.addChild(component);
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
    }
    /**
     * 清空所有消息。
     */
    clear() {
        this.entries = [];
        this.components.clear();
        super.clear();
    }
    /**
     * 获取当前条目数量。
     */
    get entry_count() {
        return this.entries.length;
    }
    create_component(entry) {
        switch (entry.kind) {
            case "user":
                return new UserMessageComponent(entry.text);
            case "assistant":
                return new AssistantMessageComponent();
            case "tool-call":
            case "tool-result":
            case "tool-approval-request":
            case "tool-approval-result":
                return new ToolCallBlockComponent(entry);
            case "status":
                return new Text(current_theme.fg("textDim", entry.text), 0, 0);
            case "error":
                return new Text(current_theme.fg("error", entry.text), 0, 0);
            default:
                return new GutterContainer(CHROME_GUTTER, CHROME_GUTTER);
        }
    }
}
//# sourceMappingURL=MessageList.js.map