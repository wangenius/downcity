/**
 * 自动完成列表的换行版本。
 *
 * 关键点（中文）
 * - 直接从 Kimi Code 挪用：把长描述折成最多两行，而不是 pi-tui 默认的单行截断。
 * - 只覆盖 render；选择、过滤、按键处理仍由 pi-tui 的 SelectList 负责。
 */
import { SelectList } from "@earendil-works/pi-tui";
/**
 * 支持描述换行的 SelectList。
 */
export declare class WrappingSelectList extends SelectList {
    render(width: number): string[];
    private render_item_lines;
    private truncate_primary_value;
    private primary_column_width;
    private internals;
}
//# sourceMappingURL=WrappingSelectList.d.ts.map