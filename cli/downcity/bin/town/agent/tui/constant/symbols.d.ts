/**
 * town agent chat TUI 通用符号常量。
 *
 * 完全对齐 Kimi Code 的 DESIGN.md 规范。
 */
/**
 * 列表选中指针。与 Kimi Code DESIGN.md 保持一致：仅一个字符，
 * 由调用方自行决定与文本之间的间距。
 */
export declare const SELECT_POINTER = "\u276F";
/**
 * 当前/激活项行尾标记，与 Kimi 保持一致：纯 `← current`，
 * 调用方在前面拼接一个空格保持视觉间距。
 */
export declare const CURRENT_MARK = "\u2190 current";
/**
 * 状态消息前缀，用于 assistant / tool / system 消息。
 * 使用 U+25CF 而非 U+23FA，避免终端把它当 emoji 渲染。
 */
export declare const STATUS_BULLET = "\u25CF ";
/**
 * 用户消息前缀。Kimi Code 使用 ✨。
 */
export declare const USER_MESSAGE_BULLET = "\u2728 ";
/**
 * 成功标记。
 */
export declare const SUCCESS_MARK = "\u2713 ";
/**
 * 失败标记。
 */
export declare const FAILURE_MARK = "\u2717 ";
//# sourceMappingURL=symbols.d.ts.map