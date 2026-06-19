/**
 * tool 调用与结果展示组件。
 *
 * 关键点（中文）
 * - 标题使用 primary 色，详情行使用 textDim。
 * - 支持 tool-call、tool-result、approval-request、approval-result 四种展示形态。
 * - 对齐 Kimi Code 的 tool 卡片视觉：标题一行 + 缩进详情。
 */
import { type Component } from "@earendil-works/pi-tui";
import type { ToolApprovalRequestEntry, ToolApprovalResultEntry, ToolCallEntry, ToolResultEntry } from "../types.js";
/**
 * 可展示的 tool 块条目联合类型。
 */
export type ToolBlockEntry = ToolCallEntry | ToolResultEntry | ToolApprovalRequestEntry | ToolApprovalResultEntry;
/**
 * tool 状态/结果卡片组件。
 */
export declare class ToolCallBlockComponent implements Component {
    private readonly entry;
    private readonly spacer;
    /**
     * @param entry tool 相关条目。
     */
    constructor(entry: ToolBlockEntry);
    /**
     * 无缓存需要清理。
     */
    invalidate(): void;
    /**
     * 渲染 tool 卡片。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
    private build_title;
    private build_detail_lines;
    private format_json_args;
    private format_result;
}
//# sourceMappingURL=ToolCallBlock.d.ts.map