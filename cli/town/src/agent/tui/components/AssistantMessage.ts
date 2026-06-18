/**
 * 助手消息组件。
 *
 * 关键点（中文）
 * - 使用 pi-tui Markdown 渲染助手文本。
 * - 前缀使用状态子弹，文本为空时不渲染。
 */

import { Container, Markdown, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

import { STATUS_BULLET } from "../constant/symbols.js";
import { MESSAGE_INDENT } from "../constant/rendering.js";
import { current_theme } from "../theme/index.js";
import { createMarkdownTheme } from "../theme/pi-tui-theme.js";

/**
 * 渲染一条助手消息。
 */
export class AssistantMessageComponent implements Component {
  private content_container: Container;
  private last_text = "";
  private show_bullet: boolean;

  /**
   * @param show_bullet 是否在首行显示状态子弹。
   */
  constructor(show_bullet: boolean = true) {
    this.show_bullet = show_bullet;
    this.content_container = new Container();
  }

  /**
   * 更新要渲染的文本。
   *
   * @param text 助手文本。
   */
  update_content(text: string): void {
    if (text === this.last_text) {
      return;
    }
    this.last_text = text;
    this.content_container.clear();
    if (text.trim().length > 0) {
      this.content_container.addChild(new Markdown(text.trim(), 0, 0, createMarkdownTheme()));
    }
  }

  /**
   * 主题切换时重置缓存。
   */
  invalidate(): void {
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
    if (this.last_text.trim().length === 0) {
      return [];
    }

    const safe_width = Math.max(0, width);
    if (safe_width <= 0) {
      return [""];
    }

    const prefix = this.show_bullet ? STATUS_BULLET : MESSAGE_INDENT;
    const content_width = Math.max(1, safe_width - visibleWidth(prefix));
    const content_lines = this.content_container.render(content_width);

    const lines: string[] = [""];
    for (let i = 0; i < content_lines.length; i += 1) {
      const is_first_line = i === 0 && this.show_bullet;
      const bullet = is_first_line
        ? current_theme.fg("text", STATUS_BULLET)
        : MESSAGE_INDENT;
      lines.push(bullet + content_lines[i]);
    }

    return lines.map((line) => truncateToWidth(line, safe_width, "…"));
  }
}
