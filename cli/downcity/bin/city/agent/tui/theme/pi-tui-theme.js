/**
 * pi-tui 内置组件需要的主题适配。
 *
 * 关键点（中文）
 * - Markdown 与 Editor 都需要传入 pi-tui 的 theme 对象。
 * - 这里把 city 的语义 token 映射为 pi-tui 的 theme 字段。
 */
import { current_theme } from "./theme.js";
/**
 * 创建 pi-tui Markdown 组件可用的主题。
 *
 * @returns MarkdownTheme。
 */
export function createMarkdownTheme() {
    return {
        heading: (text) => current_theme.bold_fg("textStrong", text),
        link: (text) => current_theme.fg("primary", text),
        linkUrl: (text) => current_theme.dim_fg("textMuted", text),
        code: (text) => current_theme.fg("accent", text),
        codeBlock: (text) => current_theme.fg("text", text),
        codeBlockBorder: (text) => current_theme.dim_fg("textMuted", text),
        quote: (text) => current_theme.fg("textDim", text),
        quoteBorder: (text) => current_theme.dim_fg("textMuted", text),
        hr: (text) => current_theme.dim_fg("textMuted", text),
        listBullet: (text) => current_theme.fg("text", text),
        bold: (text) => current_theme.bold_fg("textStrong", text),
        italic: (text) => current_theme.fg("textDim", text),
        strikethrough: (text) => current_theme.fg("textDim", text),
        underline: (text) => current_theme.fg("primary", text),
    };
}
/**
 * 创建 pi-tui Editor 组件可用的主题。
 *
 * @returns EditorTheme。
 */
export function createEditorTheme() {
    return {
        borderColor: (text) => current_theme.fg("border", text),
        selectList: createSelectListTheme(),
    };
}
/**
 * 创建 pi-tui SelectList 组件可用的主题。
 *
 * @returns SelectListTheme。
 */
export function createSelectListTheme() {
    return {
        selectedPrefix: (text) => current_theme.fg("primary", text),
        selectedText: (text) => current_theme.bold_fg("primary", text),
        description: (text) => current_theme.fg("textDim", text),
        scrollInfo: (text) => current_theme.fg("textMuted", text),
        noMatch: (text) => current_theme.fg("textDim", text),
    };
}
//# sourceMappingURL=pi-tui-theme.js.map