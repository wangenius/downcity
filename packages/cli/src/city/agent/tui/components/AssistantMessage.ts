/**
 * 助手消息组件。
 *
 * 关键点（中文）
 * - 完全对齐 Kimi Code AssistantMessageComponent：使用 pi-tui Markdown 渲染助手文本。
 * - 使用 Assistant 角色标题与执行状态建立稳定层级。
 * - 流式阶段展示 working 状态，完成后自动收敛为普通角色标题。
 */

import { Container, Markdown, truncateToWidth, type Component } from "@earendil-works/pi-tui";

import {
  BRAILLE_SPINNER_FRAMES,
  MESSAGE_INDENT,
} from "@/city/agent/tui/constant/rendering.js";
import { current_theme } from "@/city/agent/tui/theme/index.js";
import { createMarkdownTheme } from "@/city/agent/tui/theme/pi-tui-theme.js";

/**
 * 渲染一条助手消息。
 */
export class AssistantMessageComponent implements Component {
  private content_container: Container;
  private last_text = "";
  private show_bullet: boolean;
  private streaming = false;

  /**
   * @param show_bullet 是否在首行显示状态子弹。
   */
  constructor(show_bullet: boolean = true, streaming: boolean = false) {
    this.show_bullet = show_bullet;
    this.streaming = streaming;
    this.content_container = new Container();
  }

  /**
   * 设置是否显示首行 bullet。
   *
   * @param show 是否显示。
   */
  set_show_bullet(show: boolean): void {
    this.show_bullet = show;
  }

  /**
   * 更新要渲染的文本。
   *
   * @param text 助手文本。
   */
  update_content(text: string, streaming: boolean = this.streaming): void {
    const display_text = text;
    if (display_text === this.last_text && streaming === this.streaming) {
      return;
    }
    this.last_text = display_text;
    this.streaming = streaming;
    this.content_container.clear();
    if (display_text.trim().length > 0) {
      this.content_container.addChild(
        new Markdown(display_text.trim(), 0, 0, createMarkdownTheme()),
      );
    }
  }

  /**
   * 主题切换时重置缓存。
   */
  invalidate(): void {
    // Markdown 会缓存 ANSI 颜色，主题切换后需要重建。
    this.content_container.clear();
    if (this.last_text.trim().length > 0) {
      this.content_container.addChild(
        new Markdown(this.last_text.trim(), 0, 0, createMarkdownTheme()),
      );
    }
  }

  /**
   * 渲染助手消息。
   *
   * @param width 可用宽度。
   * @returns 渲染后的行数组。
   */
  render(width: number): string[] {
    const has_content = this.last_text.trim().length > 0;
    if (!has_content && !this.streaming) {
      return [];
    }

    const safe_width = Math.max(0, width);
    if (safe_width <= 0) {
      return [""];
    }

    const content_width = Math.max(1, safe_width - MESSAGE_INDENT.length);
    const content_lines = has_content
      ? this.content_container.render(content_width)
      : [];

    const role = current_theme.bold_fg("primary", "Assistant");
    const state = this.streaming
      ? current_theme.dim_fg("primary", ` · ${get_working_frame()} working`)
      : "";
    const lines: string[] = ["", this.show_bullet ? `${role}${state}` : state.trimStart()];
    for (const content_line of content_lines) {
      lines.push(MESSAGE_INDENT + content_line);
    }

    return lines.map((line) => truncateToWidth(line, safe_width, "…"));
  }
}

/** 根据当前时间计算 working 动画帧；重绘节拍由 StreamingUIController 驱动。 */
function get_working_frame(): string {
  const frame_index = Math.floor(Date.now() / 80) % BRAILLE_SPINNER_FRAMES.length;
  return BRAILLE_SPINNER_FRAMES[frame_index] ?? BRAILLE_SPINNER_FRAMES[0];
}
