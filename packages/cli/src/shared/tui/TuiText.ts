/**
 * 共享 TUI 文本处理工具。
 *
 * 关键点（中文）
 * - pi-tui 组件以 string[] 作为渲染结果，本模块集中处理换行、截断与补齐。
 * - 宽度计算使用 pi-tui 的 visibleWidth，兼容中文与 ANSI 颜色。
 */

import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const ELLIPSIS = "…";

/**
 * 按终端宽度截断文本。
 */
export function tui_truncate(text: string, width: number): string {
  return truncateToWidth(String(text), Math.max(0, width), ELLIPSIS);
}

/**
 * 将文本补齐到指定显示宽度。
 */
export function tui_pad_end(text: string, width: number): string {
  const value = tui_truncate(text, width);
  const padding = Math.max(0, width - visibleWidth(value));
  return `${value}${" ".repeat(padding)}`;
}

/**
 * 包装多行文本。
 */
export function tui_wrap_lines(text: string, width: number): string[] {
  const safe_width = Math.max(1, width);
  const source_lines = strip_blessed_tags(String(text || "")).split(/\r?\n/);
  const lines: string[] = [];

  for (const source_line of source_lines) {
    if (!source_line) {
      lines.push("");
      continue;
    }
    const wrapped = wrapTextWithAnsi(source_line, safe_width);
    lines.push(...(wrapped.length > 0 ? wrapped : [""]));
  }

  return lines;
}

function strip_blessed_tags(text: string): string {
  return text
    .replace(/\{\/?(bold|underline|red-fg|green-fg|cyan-fg|yellow-fg|blue-fg|magenta-fg|white-fg|gray-fg)\}/g, "")
    .replace(/\{\/?[^}]+\}/g, "");
}

/**
 * 截取一个可滚动视口。
 */
export function tui_viewport(lines: string[], height: number, scroll_offset: number): string[] {
  const safe_height = Math.max(0, height);
  if (safe_height <= 0) return [];
  if (lines.length <= safe_height) return lines;
  const max_offset = Math.max(0, lines.length - safe_height);
  const offset = Math.max(0, Math.min(max_offset, scroll_offset));
  return lines.slice(offset, offset + safe_height);
}
