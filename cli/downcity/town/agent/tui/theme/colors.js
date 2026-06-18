/**
 * town agent chat TUI 颜色调色板。
 *
 * 关键点（中文）
 * - 完全参考 Kimi Code 的语义 token 设计，确保颜色含义一致。
 * - 每个 token 都附带用途注释，组件必须通过 token 取色，禁止裸写颜色值。
 */
import chalk from "chalk";
/**
 * 暗色主题默认调色板。
 */
export const darkColors = {
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
export const lightColors = {
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
 * 获取指定内置主题的调色板。
 *
 * @param theme 主题名称。
 * @returns 对应的 ColorPalette。
 */
export function getBuiltInPalette(theme) {
    return theme === "light" ? lightColors : darkColors;
}
/**
 * 为文本应用指定 token 的前景色。
 *
 * @param token 语义颜色 token。
 * @param text 目标文本。
 * @returns 带 ANSI 颜色的文本。
 */
export function colorize(token, text) {
    return chalk.hex(darkColors[token])(text);
}
//# sourceMappingURL=colors.js.map