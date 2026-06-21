/**
 * 助手消息组件。
 *
 * 关键点（中文）
 * - 使用 pi-tui Markdown 渲染助手文本。
 * - 前缀使用状态子弹，文本为空时不渲染。
 */
import { type Component } from "@earendil-works/pi-tui";
/**
 * 渲染一条助手消息。
 */
export declare class AssistantMessageComponent implements Component {
    private content_container;
    private last_text;
    private show_bullet;
    /**
     * @param show_bullet 是否在首行显示状态子弹。
     */
    /**
     * @param show_bullet 是否在首行显示状态子弹。
     * @param text 可选初始文本。
     */
    constructor(show_bullet?: boolean, text?: string);
    /**
     * 更新要渲染的文本。
     *
     * @param text 助手文本。
     */
    update_content(text: string): void;
    /**
     * 主题切换时重置缓存。
     */
    invalidate(): void;
    /**
     * 渲染助手消息。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
}
//# sourceMappingURL=AssistantMessage.d.ts.map