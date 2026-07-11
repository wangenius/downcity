/**
 * Agent Chat TUI 底部信息栏。
 *
 * 关键点（中文）
 * - 固定在输入框下方，常驻展示当前 session 标题、sessionId 与模型名称。
 * - 右侧根据状态切换：空闲时显示快捷键提示，执行中显示 braille 动画与状态文本。
 * - 自驱动 braille 动画，与 Kimi Code 的活动指示器视觉一致。
 */

import { truncateToWidth, visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";

import {
  BRAILLE_SPINNER_FRAMES,
  BRAILLE_SPINNER_INTERVAL_MS,
} from "@/city/agent/tui/constant/rendering.js";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import type { AppState } from "@/city/agent/tui/types.js";

const FOOTER_RIGHT_IDLE = "Type /help · /session · /model · /new · /clear · /quit";
const MIN_GAP = 2;

/**
 * 聊天输入框底部信息栏。
 */
export class ChatFooterComponent implements Component {
  private app_state: AppState;
  private readonly tui: TUI;
  private spinner_frame = 0;
  private spinner_timer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param app_state 初始应用状态。
   * @param tui 所属 TUI 实例，用于动画帧推进时请求重绘。
   */
  constructor(app_state: AppState, tui: TUI) {
    this.app_state = app_state;
    this.tui = tui;
  }

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
   * 渲染底部信息栏。
   *
   * @param width 可用宽度。
   * @returns 渲染后的行数组。
   */
  render(width: number): string[] {
    const safe_width = Math.max(0, width);
    if (safe_width <= 0) {
      return [""];
    }

    const left = this.build_left();
    const right = this.build_right();
    const left_width = visibleWidth(left);
    const right_width = visibleWidth(right);

    if (left_width + right_width + MIN_GAP > safe_width) {
      // 右侧优先完整展示，左侧截断。
      const max_left = Math.max(0, safe_width - right_width - MIN_GAP);
      const left_truncated = truncateToWidth(left, max_left, "…");
      const gap = Math.max(1, safe_width - visibleWidth(left_truncated) - right_width);
      return [left_truncated + " ".repeat(gap) + right];
    }

    const gap = safe_width - left_width - right_width;
    return [left + " ".repeat(gap) + right];
  }

  /**
   * 构建左侧 session 信息。
   */
  private build_left(): string {
    const title = this.app_state.session_title?.trim() || "Untitled";
    const model_name = this.app_state.session_model_name?.trim()
      || this.app_state.session_model_id?.trim()
      || "agent default";
    const raw = `${title} · ${this.app_state.session_id} · ${model_name}`;
    return current_theme.dim_fg("textMuted", raw);
  }

  /**
   * 构建右侧提示/状态。
   */
  private build_right(): string {
    if (!this.is_active()) {
      return current_theme.dim_fg("textMuted", FOOTER_RIGHT_IDLE);
    }

    const frame = BRAILLE_SPINNER_FRAMES[this.spinner_frame] ?? BRAILLE_SPINNER_FRAMES[0];
    const colored_frame = current_theme.fg("primary", frame);
    const label = `${colored_frame} ${this.app_state.status_text}`;
    return label;
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
