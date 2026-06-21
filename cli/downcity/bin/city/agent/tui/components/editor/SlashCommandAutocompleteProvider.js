/**
 * slash 命令优先的自动完成提供器。
 *
 * 关键点（中文）
 * - pi-tui 的 CombinedAutocompleteProvider 会把 `/h` 这类输入当成绝对路径补全，
 *   从而覆盖 slash 命令提示；这里自定义 provider，让 `/` 前缀优先匹配内置 slash 命令。
 * - 非 slash 前缀回退到 CombinedAutocompleteProvider 的文件路径补全。
 */
import { CombinedAutocompleteProvider, } from "@earendil-works/pi-tui";
/**
 * 判断当前 prefix 是否为 slash 命令前缀。
 *
 * 规则：以 `/` 开头，且去掉 `/` 后只含字母、数字、下划线、连字符（不含 `/`）。
 */
function is_slash_command_prefix(prefix) {
    if (!prefix.startsWith("/")) {
        return false;
    }
    const tail = prefix.slice(1);
    if (tail.length === 0) {
        return true;
    }
    return /^[a-zA-Z0-9_-]+$/.test(tail);
}
/**
 * slash 命令优先的自动完成提供器。
 *
 * 先判断当前 prefix 是否属于 slash 命令；若是则返回 slash 命令候选项，
 * 否则把请求转发给文件路径补全提供器。
 */
export class SlashFirstAutocompleteProvider {
    commands;
    file_provider;
    /**
     * @param commands 内置 slash 命令列表。
     * @param base_path 文件补全的基准路径。
     */
    constructor(commands, base_path) {
        this.commands = commands;
        this.file_provider = new CombinedAutocompleteProvider([], base_path);
    }
    /**
     * 获取自动完成建议。
     */
    async getSuggestions(lines, cursor_line, cursor_col, options) {
        const line = lines[cursor_line] ?? "";
        const prefix = line.slice(0, cursor_col);
        if (is_slash_command_prefix(prefix)) {
            const query = prefix.slice(1).toLowerCase();
            const items = [];
            for (const command of this.commands) {
                const names = [command.name, ...command.aliases];
                const matched = query.length === 0 ||
                    names.some((name) => name.toLowerCase().includes(query)) ||
                    (command.description?.toLowerCase().includes(query) ?? false);
                if (!matched) {
                    continue;
                }
                items.push({
                    value: command.name,
                    label: `/${command.name}`,
                    description: command.description,
                });
            }
            if (items.length === 0) {
                return null;
            }
            return { items, prefix };
        }
        return await this.file_provider.getSuggestions(lines, cursor_line, cursor_col, options);
    }
    /**
     * 应用选中的自动完成项。
     */
    applyCompletion(lines, cursor_line, cursor_col, item, prefix) {
        if (is_slash_command_prefix(prefix)) {
            const new_lines = [...lines];
            const command_text = `/${item.value}`;
            new_lines[cursor_line] = command_text;
            return {
                lines: new_lines,
                cursorLine: cursor_line,
                cursorCol: command_text.length,
            };
        }
        return this.file_provider.applyCompletion(lines, cursor_line, cursor_col, item, prefix);
    }
    /**
     * 是否应触发文件补全。
     */
    shouldTriggerFileCompletion(lines, cursor_line, cursor_col) {
        return this.file_provider.shouldTriggerFileCompletion(lines, cursor_line, cursor_col);
    }
}
//# sourceMappingURL=SlashCommandAutocompleteProvider.js.map