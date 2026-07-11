/**
 * 状态栏组件。
 *
 * 关键点（中文）
 * - 始终渲染一行持久 header：`{session_title} · {session_id}`。
 * - 执行中在 header 下方继续渲染 “{braille 动画帧} {status_text}” 活动指示器。
 * - 自驱动 braille 动画：执行态启动定时器逐帧推进并请求重绘，空闲态停止。
 * - 超出宽度时截断。
 */

import { Text, truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";

import {
  BRAILLE_SPINNER_FRAMES,
  BRAILLE_SPINNER_INTERVAL_MS,
} from "@/city/agent/tui/constant/rendering.js";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import type { AppState } from "@/city/agent/tui/types.js";

/**
 * 顶部状态栏。
 */
export class StatusLineComponent implements Component {
  /** 当前 braille 动画帧索引。 */
  private spinner_frame = 0;
  /** 动画定时器句柄；空闲时为 null。 */
  private spinner_timer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param app_state 初始应用状态。
   * @param tui 所属 TUI 实例，用于动画帧推进时请求重绘。
   */
  constructor(
    private app_state: AppState,
    private readonly tui: TUI,
  ) {}

  /**
   * 更新状态。执行态启动动画，空闲态停止。
   *
   * @param app_state 新状态。
   */
  set_state(app_state: AppState): void {
    this.app_state = app_state;
    if (this.is_active()) {
      this.start_spinner();
    } else {
      this.stop_spinner();
    }
  }

  /**
   * 停止动画并释放定时器。退出 TUI 前调用。
   */
  dispose(): void {
    this.stop_spinner();
  }

  /**
   * 无缓存需要清理。
   */
  invalidate(): void {
    // 状态由外部持有，组件只是投影。
  }

  /**
   * 渲染状态栏。
   *
   * 关键点（中文）
   * - 第一行永远是 session header（title + sessionId）。
   * - 执行中在 header 下方追加 braille 动画状态行。
   *
   * @param width 可用宽度。
   * @returns 渲染后的行数组。
   */
  render(width: number): string[] {
    const safe_width = Math.max(0, width);
    if (safe_width <= 0) {
      return [""];
    }

    const lines: string[] = [this.build_header(safe_width)];

    if (this.is_active()) {
      // 对齐 Kimi Code 的 composing 活动指示器：
      // - 仅 braille 帧染主色，标签保持默认色（MoonLoader 的 colorFn 只作用于帧）。
      // - 左侧缩进 1 列（MoonLoader 的 padding）。
      const frame = BRAILLE_SPINNER_FRAMES[this.spinner_frame] ?? BRAILLE_SPINNER_FRAMES[0];
      const colored_frame = current_theme.fg("primary", frame);
      const label = `${colored_frame} ${this.app_state.status_text}`;
      const text_lines = new Text(label, 1, 0).render(safe_width);
      for (const line of text_lines) {
        lines.push(truncateToWidth(line, safe_width, "…"));
      }
    }

    return lines;
  }

  /**
   * 构建持久 session header。
   *
   * @param width 可用宽度。
   * @returns 截断后的 header 行。
   */
  private build_header(width: number): string {
    const title = this.app_state.session_title?.trim() || "Untitled";
    const session_id = this.app_state.session_id;
    const raw = `${title} · ${session_id}`;
    return truncateToWidth(current_theme.dim_fg("textMuted", raw), width, "…");
  }

  /**
   * 当前是否处于需要展示动画的执行态。
   */
  private is_active(): boolean {
    return this.app_state.is_executing && this.app_state.status_text.length > 0;
  }

  /**
   * 启动 braille 动画定时器。
   */
  private start_spinner(): void {
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
  private stop_spinner(): void {
    if (this.spinner_timer === null) {
      return;
    }
    clearInterval(this.spinner_timer);
    this.spinner_timer = null;
    this.spinner_frame = 0;
  }
}
