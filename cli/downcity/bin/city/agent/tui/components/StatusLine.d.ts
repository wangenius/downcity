/**
 * 状态栏组件。
 *
 * 关键点（中文）
 * - 不展示 agent / session 标题，避免与终端标题重复。
 * - 仅在有状态提示（如 `Thinking...`）时渲染单行文本。
 * - 空闲时返回空数组，不占用消息区域空间。
 * - 超出宽度时截断。
 */
import { type Component } from "@earendil-works/pi-tui";
import type { AppState } from "../../../../city/agent/tui/types.js";
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
     * 渲染状态栏。空闲时不占用空间，仅在有 `status_text` 时返回一行状态提示。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
}
//# sourceMappingURL=StatusLine.d.ts.map