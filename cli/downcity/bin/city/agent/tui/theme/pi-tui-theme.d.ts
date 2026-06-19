/**
 * pi-tui 内置组件需要的主题适配。
 *
 * 关键点（中文）
 * - Markdown 与 Editor 都需要传入 pi-tui 的 theme 对象。
 * - 这里把 city 的语义 token 映射为 pi-tui 的 theme 字段。
 */
import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";
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
/**
 * 创建 pi-tui SelectList 组件可用的主题。
 *
 * @returns SelectListTheme。
 */
export declare function createSelectListTheme(): SelectListTheme;
//# sourceMappingURL=pi-tui-theme.d.ts.map