/**
 * TUI 列表循环选择辅助。
 *
 * 关键点（中文）
 * - 统一处理 sidebar 上下边界绕回，避免不同 TUI 面板行为不一致。
 * - 支持跳过 disabled 分区标题，只让可执行项目成为最终焦点。
 * - 该模块只处理索引计算，不依赖 blessed 实例，便于后续测试与复用。
 */
/**
 * 解析当前选中索引，遇到 disabled 项时按移动方向寻找最近可选项。
 */
export declare function resolve_loop_selectable_index(items: readonly unknown[], value: unknown, fallback: number): number;
/**
 * 根据方向移动到下一个可选项，并在首尾之间循环。
 */
export declare function resolve_next_loop_selectable_index(items: readonly unknown[], current_index: number, direction: number): number;
/**
 * 判断列表项是否禁止选择。
 */
export declare function is_disabled_selectable_item(item: unknown): boolean;
//# sourceMappingURL=SelectableList.d.ts.map