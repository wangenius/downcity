/**
 * pi-tui 内置组件需要的主题适配。
 *
 * 关键点（中文）
 * - Markdown 与 Editor 都需要传入 pi-tui 的 theme 对象。
 * - 这里把 city 的语义 token 映射为 pi-tui 的 theme 字段。
 */

import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";

import { current_theme } from "./theme.js";

/**
 * 创建 pi-tui Markdown 组件可用的主题。
 *
 * @returns MarkdownTheme。
 */
export function createMarkdownTheme(): MarkdownTheme {
  return {
    heading: (text: string) => current_theme.bold_fg("textStrong", text),
    link: (text: string) => current_theme.fg("primary", text),
    linkUrl: (text: string) => current_theme.dim_fg("textMuted", text),
    code: (text: string) => current_theme.fg("accent", text),
    codeBlock: (text: string) => current_theme.fg("text", text),
    codeBlockBorder: (text: string) => current_theme.dim_fg("textMuted", text),
    quote: (text: string) => current_theme.fg("textDim", text),
    quoteBorder: (text: string) => current_theme.dim_fg("textMuted", text),
    hr: (text: string) => current_theme.dim_fg("textMuted", text),
    listBullet: (text: string) => current_theme.fg("text", text),
    bold: (text: string) => current_theme.bold_fg("textStrong", text),
    italic: (text: string) => current_theme.fg("textDim", text),
    strikethrough: (text: string) => current_theme.fg("textDim", text),
    underline: (text: string) => current_theme.fg("primary", text),
  };
}

/**
 * 创建 pi-tui Editor 组件可用的主题。
 *
 * @returns EditorTheme。
 */
export function createEditorTheme(): EditorTheme {
  return {
    borderColor: (text: string) => current_theme.fg("border", text),
    selectList: createSelectListTheme(),
  };
}

/**
 * 创建 pi-tui SelectList 组件可用的主题。
 *
 * @returns SelectListTheme。
 */
export function createSelectListTheme(): SelectListTheme {
  return {
    selectedPrefix: (text: string) => current_theme.fg("primary", text),
    selectedText: (text: string) => current_theme.bold_fg("primary", text),
    description: (text: string) => current_theme.fg("textDim", text),
    scrollInfo: (text: string) => current_theme.fg("textMuted", text),
    noMatch: (text: string) => current_theme.fg("textDim", text),
  };
}
