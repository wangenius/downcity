/**
 * 用户消息组件。
 *
 * 关键点（中文）
 * - 使用 roleUser 色渲染子弹前缀与文本。
 * - 文本按可用宽度自动换行，保持子弹对齐。
 */
import { Spacer, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { USER_MESSAGE_BULLET } from "../constant/symbols.js";
import { current_theme } from "../theme/index.js";
/**
 * 渲染一条用户消息。
 */
export class UserMessageComponent {
    text;
    spacer;
    /**
     * @param text 用户输入文本。
     */
    constructor(text) {
        this.text = text;
        this.spacer = new Spacer(1);
    }
    /**
     * 组件无需缓存清理。
     */
    invalidate() {
        // 文本不变，无需刷新。
    }
    /**
     * 渲染用户消息。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width) {
        const safe_width = Math.max(0, width);
        if (safe_width <= 0) {
            return [""];
        }
        const bullet = current_theme.bold_fg("roleUser", USER_MESSAGE_BULLET);
        const bullet_width = visibleWidth(bullet);
        const content_width = Math.max(1, safe_width - bullet_width);
        const lines = [];
        for (const line of this.spacer.render(safe_width)) {
            lines.push(line);
        }
        const colored_text = current_theme.bold_fg("roleUser", this.text);
        const text_lines = new Text(colored_text, 0, 0).render(content_width);
        for (let i = 0; i < text_lines.length; i += 1) {
            const prefix = i === 0 ? bullet : " ".repeat(bullet_width);
            lines.push(prefix + text_lines[i]);
        }
        return lines.map((line) => truncateToWidth(line, safe_width, "…"));
    }
}
//# sourceMappingURL=UserMessage.js.map