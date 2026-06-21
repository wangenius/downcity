/**
 * tool 调用与结果展示组件。
 *
 * 关键点（中文）
 * - 标题使用 primary 色，详情行使用 textDim。
 * - 支持 tool-call、tool-result、approval-request、approval-result 四种展示形态。
 * - 对齐 Kimi Code 的 tool 卡片视觉：标题一行 + 缩进详情，默认折叠，避免单个 tool 结果占满屏幕。
 * - 详情超过 RESULT_PREVIEW_LINES 时截断，展开后显示完整内容。
 */
import { type Component } from "@earendil-works/pi-tui";
import type { ToolApprovalRequestEntry, ToolApprovalResultEntry, ToolCallEntry, ToolResultEntry } from "../../../../city/agent/tui/types.js";
/**
 * 可展示的 tool 块条目联合类型。
 */
export type ToolBlockEntry = ToolCallEntry | ToolResultEntry | ToolApprovalRequestEntry | ToolApprovalResultEntry;
/**
 * tool 状态/结果卡片组件。
 *
 * 默认折叠，仅展示标题与最多 RESULT_PREVIEW_LINES 行详情，
 * 避免长输出把历史消息顶出可视区。
 */
export declare class ToolCallBlockComponent implements Component {
    private readonly entry;
    private expanded;
    private readonly spacer;
    /**
     * @param entry tool 相关条目。
     */
    constructor(entry: ToolBlockEntry);
    /**
     * 切换展开/折叠状态。
     */
    toggle(): void;
    /**
     * 当前是否处于展开状态。
     */
    is_expanded(): boolean;
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