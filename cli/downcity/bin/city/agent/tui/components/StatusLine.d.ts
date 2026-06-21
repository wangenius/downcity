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
import { type Component, type TUI } from "@earendil-works/pi-tui";
import type { AppState } from "../../../../city/agent/tui/types.js";
/**
 * 顶部状态栏。
 */
export declare class StatusLineComponent implements Component {
    private app_state;
    private readonly tui;
    /** 当前 braille 动画帧索引。 */
    private spinner_frame;
    /** 动画定时器句柄；空闲时为 null。 */
    private spinner_timer;
    /**
     * @param app_state 初始应用状态。
     * @param tui 所属 TUI 实例，用于动画帧推进时请求重绘。
     */
    constructor(app_state: AppState, tui: TUI);
    /**
     * 更新状态。执行态启动动画，空闲态停止。
     *
     * @param app_state 新状态。
     */
    set_state(app_state: AppState): void;
    /**
     * 停止动画并释放定时器。退出 TUI 前调用。
     */
    dispose(): void;
    /**
     * 无缓存需要清理。
     */
    invalidate(): void;
    /**
     * 渲染状态栏。空闲时不占用空间，仅在执行态返回一行动画状态提示。
     *
     * @param width 可用宽度。
     * @returns 渲染后的行数组。
     */
    render(width: number): string[];
    /**
     * 当前是否处于需要展示动画的执行态。
     */
    private is_active;
    /**
     * 启动 braille 动画定时器。
     */
    private start_spinner;
    /**
     * 停止 braille 动画定时器并重置帧。
     */
    private stop_spinner;
}
//# sourceMappingURL=StatusLine.d.ts.map