/**
 * 用户消息组件。
 *
 * 关键点（中文）
 * - 使用 roleUser 色渲染子弹前缀与文本。
 * - 文本按可用宽度自动换行，保持子弹对齐。
 */
import { type Component } from "@earendil-works/pi-tui";
/**
 * 渲染一条用户消息。
 */
export declare class UserMessageComponent implements Component {
    private readonly text;
    /**
     * @param text 用户输入文本。
     */
    constructor(text: string);
    /**
     * 组件无需缓存清理。
     */
    invalidate(): void;
    /**
     * 渲染用户消息。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
}
//# sourceMappingURL=UserMessage.d.ts.map