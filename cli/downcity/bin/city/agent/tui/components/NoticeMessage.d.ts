/**
 * 提示消息组件。
 *
 * 关键点（中文）
 * - 直接从 Kimi Code 的 status-message.ts 挪用。
 * - 继承 Container，顶部带 Spacer，支持 invalidate 重新染色。
 * - 标题使用 textStrong，详情使用 textDim。
 */
import { Container } from "@earendil-works/pi-tui";
/**
 * 渲染一条提示消息。
 */
export declare class NoticeMessageComponent extends Container {
    private title_text;
    private detail_text?;
    private title;
    private detail?;
    /**
     * @param title 标题文本。
     * @param detail 可选详情文本。
     */
    constructor(title: string, detail?: string);
    /**
     * 主题切换时重新染色。
     */
    invalidate(): void;
}
//# sourceMappingURL=NoticeMessage.d.ts.map