/**
 * 带左右边距的容器。
 *
 * 关键点（中文）
 * - 直接从 Kimi Code 挪用：在内容两侧保留固定列数的空白边距。
 * - 内部组件按 `width - left - right` 渲染，每行前缀补 `left` 个空格。
 * - 右侧边距是逻辑上的，不输出尾随空格，避免 diff 渲染器无意义刷新。
 */
import { Container } from "@earendil-works/pi-tui";
/**
 * 边距容器。
 */
export declare class GutterContainer extends Container {
    private readonly left_pad;
    private readonly right_pad;
    /**
     * @param left_pad 左侧空白列数。
     * @param right_pad 右侧空白列数。
     */
    constructor(left_pad: number, right_pad: number);
    /**
     * 渲染带边距的内容。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
}
//# sourceMappingURL=GutterContainer.d.ts.map