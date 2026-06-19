/**
 * 顶部状态栏组件。
 *
 * 关键点（中文）
 * - 展示当前 agent / session / 状态提示。
 * - 居中或左对齐，超出宽度时截断。
 */
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { current_theme } from "../theme/index.js";
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
     * 渲染状态栏。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width) {
        const safe_width = Math.max(0, width);
        if (safe_width <= 0) {
            return [""];
        }
        const agent_part = current_theme.bold_fg("textStrong", this.app_state.agent_id);
        const session_part = current_theme.fg("textDim", this.app_state.session_id);
        const status_part = current_theme.fg("primary", this.app_state.status_text);
        const raw_text = `Agent chat · ${agent_part} · ${session_part}`;
        const full_text = this.app_state.status_text
            ? `${raw_text} · ${status_part}`
            : raw_text;
        const text_lines = new Text(full_text, 0, 0).render(safe_width);
        return text_lines.map((line) => truncateToWidth(line, safe_width, "…"));
    }
}
//# sourceMappingURL=StatusLine.js.map