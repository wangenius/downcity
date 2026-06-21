/**
 * city agent chat TUI 颜色调色板。
 *
 * 关键点（中文）
 * - 完全参考 Kimi Code 的语义 token 设计，确保颜色含义一致。
 * - 每个 token 都附带用途注释，组件必须通过 token 取色，禁止裸写颜色值。
 */
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
    /** diff 新增行。 */
    diffAdded: string;
    /** diff 删除行。 */
    diffRemoved: string;
    /** diff 新增行中高亮改变的单词。 */
    diffAddedStrong: string;
    /** diff 删除行中高亮改变的单词。 */
    diffRemovedStrong: string;
    /** diff 行号 gutter。 */
    diffGutter: string;
    /** diff 元信息 / hunk header。 */
    diffMeta: string;
    /** 用户消息：bullet 与文本颜色。 */
    roleUser: string;
}
/**
 * 暗色主题默认调色板。
 */
export declare const darkColors: ColorPalette;
/**
 * 亮色主题默认调色板。
 */
export declare const lightColors: ColorPalette;
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
export declare function getBuiltInPalette(theme: ResolvedTheme): ColorPalette;
//# sourceMappingURL=colors.d.ts.map