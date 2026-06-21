/**
 * city agent chat TUI 主题类与全局单例。
 *
 * 关键点（中文）
 * - 所有组件通过 `current_theme` 取色，切换主题时只需替换调色板。
 * - 提供前景色、背景色、粗体等便捷方法，减少组件里的重复 chalk 调用。
 */
import type { ColorPalette } from "../../../../city/agent/tui/theme/colors.js";
/**
 * 颜色 token 名称，对应 ColorPalette 的每个字段。
 */
export type ColorToken = keyof ColorPalette;
/**
 * 主题样式封装。
 */
export declare class Theme {
    private palette;
    /**
     * @param palette 初始调色板。
     */
    constructor(palette: ColorPalette);
    /**
     * 当前调色板。
     */
    get current_palette(): ColorPalette;
    /**
     * 切换调色板，已渲染组件在下一帧自动使用新颜色。
     *
     * @param palette 新调色板。
     */
    set_palette(palette: ColorPalette): void;
    /**
     * 获取某个 token 的原始 hex 颜色值。
     */
    color(token: ColorToken): string;
    /**
     * 前景色。
     */
    fg(token: ColorToken, text: string): string;
    /**
     * 前景色 + 粗体。
     */
    bold_fg(token: ColorToken, text: string): string;
    /**
     * 前景色 + 暗淡。
     */
    dim_fg(token: ColorToken, text: string): string;
    /**
     * 前景色 + 斜体。
     */
    italic_fg(token: ColorToken, text: string): string;
    /**
     * 前景色 + 下划线。
     */
    underline_fg(token: ColorToken, text: string): string;
    /**
     * 前景色 + 删除线。
     */
    strikethrough_fg(token: ColorToken, text: string): string;
    /**
     * 背景色。
     */
    bg(token: ColorToken, text: string): string;
    /**
     * 纯粗体，不带颜色。
     */
    bold(text: string): string;
    /**
     * 纯暗淡，不带颜色。
     */
    dim(text: string): string;
    /**
     * 纯斜体，不带颜色。
     */
    italic(text: string): string;
    /**
     * 纯下划线，不带颜色。
     */
    underline(text: string): string;
    /**
     * 纯删除线，不带颜色。
     */
    strikethrough(text: string): string;
}
/**
 * 全局主题单例，默认暗色。
 */
export declare const current_theme: Theme;
//# sourceMappingURL=theme.d.ts.map