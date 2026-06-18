/**
 * town agent chat TUI 颜色调色板。
 *
 * 关键点（中文）
 * - 完全参考 Kimi Code 的语义 token 设计，确保颜色含义一致。
 * - 每个 token 都附带用途注释，组件必须通过 token 取色，禁止裸写颜色值。
 */

import chalk from "chalk";

/**
 * 语义颜色调色板。
 *
 * 所有 UI 颜色必须来自此接口，保证 dark/light 切换时组件无需改动。
 */
export interface ColorPalette {
  /** 主品牌/交互色：选中项、聚焦边框、链接、运行中状态。 */
  primary: string;

  /** 强调色：次要高亮、提示前缀。 */
  accent: string;

  /** 默认正文文本。 */
  text: string;

  /** 强调文本 / 加粗文本。 */
  textStrong: string;

  /** 次要暗淡文本：hint、描述、已完成状态。 */
  textDim: string;

  /** 最淡文本：计数器、滚动信息。 */
  textMuted: string;

  /** 边框颜色。 */
  border: string;

  /** 聚焦/高亮边框。 */
  borderFocus: string;

  /** 成功状态：对勾、enabled、完成。 */
  success: string;

  /** 警告状态：需要确认、计划模式提示。 */
  warning: string;

  /** 错误状态：失败消息、错误输出。 */
  error: string;

  /** 用户消息专属角色色：子弹与文本。 */
  roleUser: string;
}

/**
 * 暗色主题默认调色板。
 */
export const darkColors: ColorPalette = {
  primary: "#4FA8FF",
  accent: "#5BC0BE",
  text: "#E0E0E0",
  textStrong: "#F5F5F5",
  textDim: "#888888",
  textMuted: "#6B6B6B",
  border: "#5A5A5A",
  borderFocus: "#E8A838",
  success: "#4EC87E",
  warning: "#E8A838",
  error: "#E85454",
  roleUser: "#FFCB6B",
};

/**
 * 亮色主题默认调色板。
 */
export const lightColors: ColorPalette = {
  primary: "#1565C0",
  accent: "#00838F",
  text: "#1A1A1A",
  textStrong: "#1A1A1A",
  textDim: "#454545",
  textMuted: "#5F5F5F",
  border: "#737373",
  borderFocus: "#92660A",
  success: "#0E7A38",
  warning: "#92660A",
  error: "#B91C1C",
  roleUser: "#9A4A00",
};

/**
 * 已解析的主题名称，当前仅支持 dark/light。
 */
export type ResolvedTheme = "dark" | "light";

/**
 * 获取指定内置主题的调色板。
 *
 * @param theme 主题名称。
 * @returns 对应的 ColorPalette。
 */
export function getBuiltInPalette(theme: ResolvedTheme): ColorPalette {
  return theme === "light" ? lightColors : darkColors;
}

/**
 * 为文本应用指定 token 的前景色。
 *
 * @param token 语义颜色 token。
 * @param text 目标文本。
 * @returns 带 ANSI 颜色的文本。
 */
export function colorize(token: keyof ColorPalette, text: string): string {
  return chalk.hex(darkColors[token])(text);
}
