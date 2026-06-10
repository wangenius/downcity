/**
 * Town TUI 视图与动作类型。
 *
 * 关键说明（中文）
 * - TUI 只负责顶层导航与状态总览。
 * - 深层 agent / plugin / city 交互继续复用现有流程，避免一次性大改。
 */
/**
 * TUI 列表项。
 */
export interface tui_list_item {
    /** 稳定主键。 */
    id: string;
    /** 左侧列表标题。 */
    title: string;
    /** 左侧列表副标题。 */
    subtitle: string;
    /** 右侧详情内容。 */
    detail: string;
    /**
     * 是否仅作为分区标题展示。
     *
     * 关键点（中文）
     * - true 时该项不会作为业务动作返回，只用于把 sidebar 分成清晰区域。
     * - 键盘移动与回车选择会自动跳过该项，避免误触发。
     */
    disabled?: boolean;
}
/**
 * 顶层 TUI 动作返回值。
 */
export type tui_action_result = "refresh" | "quit";
//# sourceMappingURL=Tui.d.ts.map