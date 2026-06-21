/**
 * 输入框自动完成提供器。
 *
 * 关键点（中文）
 * - 完全对齐 Kimi Code 的 file-mention-provider：
 *   1. slash 命令名补全自己处理，支持主名 + 别名模糊匹配，别名命中时在 label 中展示来源。
 *   2. `@` 文件/目录 mention 优先走 pi-tui 的 fd 后端；fd 不可用时回退到文件系统扫描。
 *   3. 普通路径补全仍交给 pi-tui 的 CombinedAutocompleteProvider。
 * - 额外保留 Kimi 的 slash 守卫：行首带空白的 `/path` 不补全、slash 命令参数后不再触发路径补全。
 */
import { type AutocompleteItem, type AutocompleteProvider, type AutocompleteSuggestions } from "@earendil-works/pi-tui";
import type { SlashCommand } from "../../../../../city/agent/tui/commands/types.js";
/**
 * 输入框自动完成提供器。
 */
export declare class FileMentionProvider implements AutocompleteProvider {
    private readonly slash_commands;
    private readonly work_dir;
    private readonly fd_path;
    /** 内部包装的 pi-tui 组合补全提供器。 */
    private readonly inner;
    /**
     * @param slash_commands 内置 slash 命令列表。
     * @param work_dir 文件补全的基准工作目录。
     * @param fd_path fd 可执行文件路径；为 null 时使用文件系统回退。
     */
    constructor(slash_commands: readonly SlashCommand[], work_dir: string, fd_path?: string | null);
    /**
     * 获取自动完成建议。
     */
    getSuggestions(lines: string[], cursor_line: number, cursor_col: number, options: {
        signal: AbortSignal;
        force?: boolean;
    }): Promise<AutocompleteSuggestions | null>;
    /**
     * 应用选中的自动完成项。
     */
    applyCompletion(lines: string[], cursor_line: number, cursor_col: number, item: AutocompleteItem, prefix: string): {
        lines: string[];
        cursorLine: number;
        cursorCol: number;
    };
    /**
     * 按主名 + 别名对 slash 命令做模糊匹配并排序。
     *
     * 主名命中优先于别名命中（同分时主名靠前）。
     */
    private match_slash_commands;
}
//# sourceMappingURL=FileMentionProvider.d.ts.map