/**
 * Agent Chat TUI 顶部上下文栏。
 *
 * 固定展示产品、Session、模型和当前执行状态；执行中仅对状态指示器做低成本
 * 帧动画，保证流式文本区域不会因状态变化产生布局抖动。
 */

import {
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";

import {
  BRAILLE_SPINNER_FRAMES,
  BRAILLE_SPINNER_INTERVAL_MS,
} from "@/city/agent/tui/constant/rendering.js";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import type { AppState } from "@/city/agent/tui/types.js";

/** 单行 Header 的最小终端宽度。 */
const SINGLE_LINE_MIN_WIDTH = 72;

/** Header 左右信息之间的最小空白。 */
const HEADER_MIN_GAP = 2;

/**
 * Agent Chat 顶部上下文与运行状态组件。
 */
export class AgentHeaderComponent implements Component {
  private app_state: AppState;
  private readonly tui: TUI;
  private spinner_frame = 0;
  private spinner_timer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param app_state 初始应用状态。
   * @param tui 所属 TUI，用于执行状态动画触发重绘。
   */
  constructor(app_state: AppState, tui: TUI) {
    this.app_state = app_state;
    this.tui = tui;
  }

  /**
   * 更新 Header 状态并同步活动指示器生命周期。
   *
   * @param app_state 最新应用状态。
   */
  set_state(app_state: AppState): void {
    this.app_state = app_state;
    if (app_state.is_executing) this.start_spinner();
    else this.stop_spinner();
  }

  /** 释放活动指示器定时器。 */
  dispose(): void {
    this.stop_spinner();
  }

  /** Header 不维护 ANSI 渲染缓存。 */
  invalidate(): void {
    // 所有颜色均在 render 时从当前主题读取。
  }

  /**
   * 渲染顶部上下文栏。
   *
   * @param width 可用终端宽度。
   * @returns Header 行数组。
   */
  render(width: number): string[] {
    const safe_width = Math.max(1, width);
    const brand = current_theme.bold_fg("textStrong", "DOWNCITY AGENT");
    const context = current_theme.dim_fg("textDim", this.build_context());
    const status = this.build_status();
    const divider = current_theme.fg("border", "─".repeat(safe_width));

    if (safe_width < SINGLE_LINE_MIN_WIDTH) {
      return [
        align_between(brand, status, safe_width),
        truncateToWidth(context, safe_width, "…"),
        divider,
      ];
    }

    const left = `${brand}  ${context}`;
    return [align_between(left, status, safe_width), divider];
  }

  /** 构建 Session 与模型上下文。 */
  private build_context(): string {
    const title = this.app_state.session_title?.trim() || "Untitled";
    const model = this.app_state.session_model_name?.trim()
      || this.app_state.session_model_id?.trim()
      || "agent default";
    return `${title} · ${this.app_state.session_id} · ${model}`;
  }

  /** 构建固定宽度语义状态。 */
  private build_status(): string {
    if (!this.app_state.is_executing) {
      return current_theme.bold_fg("success", "● READY");
    }
    const frame = BRAILLE_SPINNER_FRAMES[this.spinner_frame] ?? BRAILLE_SPINNER_FRAMES[0];
    const label = this.app_state.status_text.trim().toUpperCase() || "WORKING";
    return `${current_theme.fg("primary", frame)} ${current_theme.bold_fg("primary", label)}`;
  }

  /** 启动执行状态动画。 */
  private start_spinner(): void {
    if (this.spinner_timer !== null) return;
    this.spinner_timer = setInterval(() => {
      this.spinner_frame = (this.spinner_frame + 1) % BRAILLE_SPINNER_FRAMES.length;
      this.tui.requestRender();
    }, BRAILLE_SPINNER_INTERVAL_MS);
  }

  /** 停止执行状态动画并重置帧。 */
  private stop_spinner(): void {
    if (this.spinner_timer !== null) clearInterval(this.spinner_timer);
    this.spinner_timer = null;
    this.spinner_frame = 0;
  }
}

/**
 * 将左右两段内容稳定放置在同一行，空间不足时优先保留右侧状态。
 */
function align_between(left: string, right: string, width: number): string {
  const right_width = visibleWidth(right);
  if (right_width >= width) return truncateToWidth(right, width, "");
  const max_left_width = Math.max(0, width - right_width - HEADER_MIN_GAP);
  const visible_left = truncateToWidth(left, max_left_width, "…");
  const gap = Math.max(1, width - visibleWidth(visible_left) - right_width);
  return truncateToWidth(`${visible_left}${" ".repeat(gap)}${right}`, width, "");
}
