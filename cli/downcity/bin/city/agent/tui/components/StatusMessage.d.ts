/**
 * 状态消息组件。
 *
 * 关键点（中文）
 * - 直接从 Kimi Code 的 status-message.ts 挪用。
 * - 继承 Container，支持 invalidate 时重新染色。
 * - 文本前缩进 2 个空格，与 bullet 对齐。
 */
import { Container } from "@earendil-works/pi-tui";
import type { ColorToken } from "../../../../city/agent/tui/theme/theme.js";
/**
 * 渲染一条状态消息。
 */
export declare class StatusMessageComponent extends Container {
    private text_component;
    private content;
    private color?;
    /**
     * @param content 状态文本。
     * @param color 颜色 token，未指定时使用 textDim。
     */
    constructor(content: string, color?: ColorToken);
    /**
     * 主题切换时重新染色。
     */
    invalidate(): void;
}
//# sourceMappingURL=StatusMessage.d.ts.map