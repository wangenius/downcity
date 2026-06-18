/**
 * town agent chat TUI 主题类与全局单例。
 *
 * 关键点（中文）
 * - 所有组件通过 `current_theme` 取色，切换主题时只需替换调色板。
 * - 提供前景色、背景色、粗体等便捷方法，减少组件里的重复 chalk 调用。
 */

import chalk from "chalk";

import type { ColorPalette } from "./colors.js";
import { darkColors } from "./colors.js";

/**
 * 颜色 token 名称，对应 ColorPalette 的每个字段。
 */
export type ColorToken = keyof ColorPalette;

/**
 * 主题样式封装。
 */
export class Theme {
  private palette: ColorPalette;

  /**
   * @param palette 初始调色板。
   */
  constructor(palette: ColorPalette) {
    this.palette = palette;
  }

  /**
   * 当前调色板。
   */
  get current_palette(): ColorPalette {
    return this.palette;
  }

  /**
   * 切换调色板，已渲染组件在下一帧自动使用新颜色。
   *
   * @param palette 新调色板。
   */
  set_palette(palette: ColorPalette): void {
    this.palette = palette;
  }

  /**
   * 获取某个 token 的原始 hex 颜色值。
   */
  color(token: ColorToken): string {
    return this.palette[token];
  }

  /**
   * 前景色。
   */
  fg(token: ColorToken, text: string): string {
    return chalk.hex(this.palette[token])(text);
  }

  /**
   * 前景色 + 粗体。
   */
  bold_fg(token: ColorToken, text: string): string {
    return chalk.hex(this.palette[token]).bold(text);
  }

  /**
   * 前景色 + 暗淡。
   */
  dim_fg(token: ColorToken, text: string): string {
    return chalk.hex(this.palette[token]).dim(text);
  }

  /**
   * 背景色。
   */
  bg(token: ColorToken, text: string): string {
    return chalk.bgHex(this.palette[token])(text);
  }

  /**
   * 纯粗体，不带颜色。
   */
  bold(text: string): string {
    return chalk.bold(text);
  }

  /**
   * 纯暗淡，不带颜色。
   */
  dim(text: string): string {
    return chalk.dim(text);
  }
}

/**
 * 全局主题单例，默认暗色。
 */
export const current_theme = new Theme(darkColors);
