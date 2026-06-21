/**
 * slash 命令优先的自动完成提供器。
 *
 * 关键点（中文）
 * - pi-tui 的 CombinedAutocompleteProvider 会把 `/h` 这类输入当成绝对路径补全，
 *   从而覆盖 slash 命令提示；这里自定义 provider，让 `/` 前缀优先匹配内置 slash 命令。
 * - 非 slash 前缀回退到 CombinedAutocompleteProvider 的文件路径补全。
 */
import { type AutocompleteItem, type AutocompleteProvider, type AutocompleteSuggestions } from "@earendil-works/pi-tui";
import type { SlashCommand } from "../../../../../city/agent/tui/commands/types.js";
/**
 * slash 命令优先的自动完成提供器。
 *
 * 先判断当前 prefix 是否属于 slash 命令；若是则返回 slash 命令候选项，
 * 否则把请求转发给文件路径补全提供器。
 */
export declare class SlashFirstAutocompleteProvider implements AutocompleteProvider {
    private readonly commands;
    private readonly file_provider;
    /**
     * @param commands 内置 slash 命令列表。
     * @param base_path 文件补全的基准路径。
     */
    constructor(commands: readonly SlashCommand[], base_path: string);
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
     * 是否应触发文件补全。
     */
    shouldTriggerFileCompletion(lines: string[], cursor_line: number, cursor_col: number): boolean;
}
//# sourceMappingURL=SlashCommandAutocompleteProvider.d.ts.map