/**
 * 状态栏组件。
 *
 * 关键点（中文）
 * - 不展示 agent / session 标题，避免与终端标题重复。
 * - 执行中渲染单行 “{braille 动画帧} {status_text}”，与 Kimi Code 的活动指示器一致。
 * - 自驱动 braille 动画：执行态启动定时器逐帧推进并请求重绘，空闲态停止。
 * - 空闲时返回空数组，不占用消息区域空间。
 * - 超出宽度时截断。
 */
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { BRAILLE_SPINNER_FRAMES, BRAILLE_SPINNER_INTERVAL_MS, } from "../../../../city/agent/tui/constant/rendering.js";
import { current_theme } from "../../../../city/agent/tui/theme/index.js";
/**
 * 顶部状态栏。
 */
export class StatusLineComponent {
    app_state;
    tui;
    /** 当前 braille 动画帧索引。 */
    spinner_frame = 0;
    /** 动画定时器句柄；空闲时为 null。 */
    spinner_timer = null;
    /**
     * @param app_state 初始应用状态。
     * @param tui 所属 TUI 实例，用于动画帧推进时请求重绘。
     */
    constructor(app_state, tui) {
        this.app_state = app_state;
        this.tui = tui;
    }
    /**
     * 更新状态。执行态启动动画，空闲态停止。
     *
     * @param app_state 新状态。
     */
    set_state(app_state) {
        this.app_state = app_state;
        if (this.is_active()) {
            this.start_spinner();
        }
        else {
            this.stop_spinner();
        }
    }
    /**
     * 停止动画并释放定时器。退出 TUI 前调用。
     */
    dispose() {
        this.stop_spinner();
    }
    /**
     * 无缓存需要清理。
     */
    invalidate() {
        // 状态由外部持有，组件只是投影。
    }
    /**
     * 渲染状态栏。空闲时不占用空间，仅在执行态返回一行动画状态提示。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width) {
        const safe_width = Math.max(0, width);
        if (safe_width <= 0) {
            return [""];
        }
        if (!this.is_active()) {
            return [];
        }
        // 对齐 Kimi Code 的 composing 活动指示器：
        // - 仅 braille 帧染主色，标签保持默认色（MoonLoader 的 colorFn 只作用于帧）。
        // - 指示器上方留 1 行空白（ActivityPane 的 Spacer(1)），左侧缩进 1 列（MoonLoader 的 padding）。
        const frame = BRAILLE_SPINNER_FRAMES[this.spinner_frame] ?? BRAILLE_SPINNER_FRAMES[0];
        const colored_frame = current_theme.fg("primary", frame);
        const label = `${colored_frame} ${this.app_state.status_text}`;
        const text_lines = new Text(label, 1, 0).render(safe_width);
        return ["", ...text_lines.map((line) => truncateToWidth(line, safe_width, "…"))];
    }
    /**
     * 当前是否处于需要展示动画的执行态。
     */
    is_active() {
        return this.app_state.is_executing && this.app_state.status_text.length > 0;
    }
    /**
     * 启动 braille 动画定时器。
     */
    start_spinner() {
        if (this.spinner_timer !== null) {
            return;
        }
        this.spinner_timer = setInterval(() => {
            this.spinner_frame = (this.spinner_frame + 1) % BRAILLE_SPINNER_FRAMES.length;
            this.tui.requestRender();
        }, BRAILLE_SPINNER_INTERVAL_MS);
    }
    /**
     * 停止 braille 动画定时器并重置帧。
     */
    stop_spinner() {
        if (this.spinner_timer === null) {
            return;
        }
        clearInterval(this.spinner_timer);
        this.spinner_timer = null;
        this.spinner_frame = 0;
    }
}
//# sourceMappingURL=StatusLine.js.map