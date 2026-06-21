/**
 * pi-tui 内置组件需要的主题适配。
 *
 * 关键点（中文）
 * - Markdown 与 Editor 都需要传入 pi-tui 的 theme 对象。
 * - 所有颜色查询都通过全局 \`current_theme\` 单例在渲染时解析，
 *   这样切换主题后，已创建的 MarkdownTheme/EditorTheme 实例也能立即生效。
 */
import type { EditorTheme, MarkdownTheme } from "@earendil-works/pi-tui";
/**
 * 创建 pi-tui Markdown 组件可用的主题。
 *
 * @returns MarkdownTheme。
 */
export declare function createMarkdownTheme(): MarkdownTheme;
/**
 * 创建 pi-tui Editor 组件可用的主题。
 *
 * @returns EditorTheme。
 */
export declare function createEditorTheme(): EditorTheme;
//# sourceMappingURL=pi-tui-theme.d.ts.map