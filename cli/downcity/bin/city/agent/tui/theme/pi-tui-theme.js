/**
 * pi-tui 内置组件需要的主题适配。
 *
 * 关键点（中文）
 * - Markdown 与 Editor 都需要传入 pi-tui 的 theme 对象。
 * - 所有颜色查询都通过全局 \`current_theme\` 单例在渲染时解析，
 *   这样切换主题后，已创建的 MarkdownTheme/EditorTheme 实例也能立即生效。
 */
import chalk from "chalk";
import { highlight, supportsLanguage } from "cli-highlight";
import { current_theme } from "../../../../city/agent/tui/theme/theme.js";
// pi-tui 对 h3-h6 会输出字面量 "### " / "#### " 等前缀，到达这里时已经带 bold SGR。
// 如果不先剥离这些井号前缀，h3+ 会渲染成 "### Title"，看起来像未解析的 markdown。
// oxlint-disable-next-line no-control-regex -- ESC 是匹配 ANSI SGR 转义序列所必需的。
const HEADING_HASH_PREFIX = /^((?:\u001B\[[0-9;]*m)*)#{1,6}[ \t]+/;
/**
 * 创建 pi-tui Markdown 组件可用的主题。
 *
 * @returns MarkdownTheme。
 */
export function createMarkdownTheme() {
    const stripHash = (text) => text.replace(HEADING_HASH_PREFIX, "$1");
    return {
        heading: (text) => chalk.bold.hex(current_theme.color("text"))(stripHash(text)),
        link: (text) => chalk.hex(current_theme.color("primary"))(text),
        linkUrl: (text) => chalk.hex(current_theme.color("textMuted"))(text),
        code: (text) => chalk.hex(current_theme.color("primary"))(text),
        codeBlock: (text) => text,
        codeBlockBorder: (text) => chalk.hex(current_theme.color("textMuted"))(text),
        quote: (text) => chalk.hex(current_theme.color("textDim"))(text),
        quoteBorder: (text) => chalk.hex(current_theme.color("textDim"))(text),
        hr: (text) => chalk.hex(current_theme.color("border"))(text),
        // 让列表 bullet 与助手消息的 bullet 一致，将默认的 "-" 替换为 "•"。
        listBullet: (text) => chalk.hex(current_theme.color("text"))(text.replace(/^-/, "•")),
        bold: (text) => chalk.bold(text),
        italic: (text) => chalk.italic(text),
        strikethrough: (text) => chalk.strikethrough(text),
        underline: (text) => chalk.underline(text),
        highlightCode: (code, lang) => {
            const normalized_lang = lang?.trim().toLowerCase();
            const language = normalized_lang !== undefined && supportsLanguage(normalized_lang) ? normalized_lang : "text";
            try {
                const highlighted = highlight(code, { language, ignoreIllegals: true });
                return highlighted.split("\n");
            }
            catch {
                return code.split("\n");
            }
        },
    };
}
/**
 * 创建 pi-tui Editor 组件可用的主题。
 *
 * @returns EditorTheme。
 */
export function createEditorTheme() {
    return {
        borderColor: (text) => chalk.hex(current_theme.color("border"))(text),
        selectList: {
            selectedPrefix: (text) => chalk.hex(current_theme.color("primary"))(text),
            selectedText: (text) => chalk.hex(current_theme.color("primary"))(text),
            description: (text) => chalk.hex(current_theme.color("textMuted"))(text),
            scrollInfo: (text) => chalk.hex(current_theme.color("textMuted"))(text),
            noMatch: (text) => chalk.hex(current_theme.color("textMuted"))(text),
        },
    };
}
//# sourceMappingURL=pi-tui-theme.js.map