/**
 * 状态栏组件。
 *
 * 关键点（中文）
 * - 不展示 agent / session 标题，避免与终端标题重复。
 * - 仅在有状态提示（如 `Thinking...`）时渲染单行文本。
 * - 空闲时返回空数组，不占用消息区域空间。
 * - 超出宽度时截断。
 */
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { current_theme } from "../../../../city/agent/tui/theme/index.js";
/**
 * 顶部状态栏。
 */
export class StatusLineComponent {
    app_state;
    /**
     * @param app_state 初始应用状态。
     */
    constructor(app_state) {
        this.app_state = app_state;
    }
    /**
     * 更新状态。
     *
     * @param app_state 新状态。
     */
    set_state(app_state) {
        this.app_state = app_state;
    }
    /**
     * 无缓存需要清理。
     */
    invalidate() {
        // 状态由外部持有，组件只是投影。
    }
    /**
     * 渲染状态栏。空闲时不占用空间，仅在有 `status_text` 时返回一行状态提示。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width) {
        const safe_width = Math.max(0, width);
        if (safe_width <= 0) {
            return [""];
        }
        if (!this.app_state.status_text) {
            return [];
        }
        const status_part = current_theme.fg("primary", this.app_state.status_text);
        const text_lines = new Text(status_part, 0, 0).render(safe_width);
        return text_lines.map((line) => truncateToWidth(line, safe_width, "…"));
    }
}
//# sourceMappingURL=StatusLine.js.map