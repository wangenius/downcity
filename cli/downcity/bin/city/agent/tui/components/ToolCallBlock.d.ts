/**
 * tool 调用与结果展示组件。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code ToolCallComponent 的 header 样式：
 *   运行中显示 `Using {tool} (keyArg)`，完成后显示 `Used {tool} (keyArg)`。
 * - bullet 颜色随状态变化：pending 用 text，success 用 success，error 用 error。
 * - 同一组件先展示 tool-call 参数，收到 tool-result 后通过 `update_result` 更新为结果。
 * - 支持 approval-request / approval-result 展示形态。
 * - 默认折叠，仅展示标题与最多 RESULT_PREVIEW_LINES 行详情，
 *   避免长输出把历史消息顶出可视区。
 */
import { type Component } from "@earendil-works/pi-tui";
import type { ToolApprovalRequestEntry, ToolApprovalResultEntry, ToolCallEntry } from "../../../../city/agent/tui/types.js";
/**
 * 可展示的 tool 块条目联合类型。
 */
export type ToolBlockEntry = ToolCallEntry | ToolApprovalRequestEntry | ToolApprovalResultEntry;
/**
 * tool 状态/结果卡片组件。
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
     * 设置展开状态。
     *
     * @param expanded 是否展开。
     */
    set_expanded(expanded: boolean): void;
    /**
     * 当前是否处于展开状态。
     */
    is_expanded(): boolean;
    /**
     * 注入 tool 执行结果。
     *
     * @param result tool 返回结果。
     */
    update_result(result: unknown): void;
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