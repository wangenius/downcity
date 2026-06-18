/**
 * 顶部状态栏组件。
 *
 * 关键点（中文）
 * - 展示当前 agent / session / 状态提示。
 * - 居中或左对齐，超出宽度时截断。
 */
import { type Component } from "@earendil-works/pi-tui";
import type { AppState } from "../types.js";
/**
 * 顶部状态栏。
 */
export declare class StatusLineComponent implements Component {
    private app_state;
    /**
     * @param app_state 初始应用状态。
     */
    constructor(app_state: AppState);
    /**
     * 更新状态。
     *
     * @param app_state 新状态。
     */
    set_state(app_state: AppState): void;
    /**
     * 无缓存需要清理。
     */
    invalidate(): void;
    /**
     * 渲染状态栏。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
}
//# sourceMappingURL=StatusLine.d.ts.map