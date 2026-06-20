/**
 * city agent chat TUI slash 意图解析。
 */
import type { SlashCommandIntent } from "../../../../city/agent/tui/commands/types.js";
/**
 * 意图解析选项。
 */
export interface ResolveSlashCommandOptions {
    /** 用户输入文本。 */
    readonly input: string;
    /** 当前是否正在流式输出/执行中。 */
    readonly is_streaming: boolean;
}
/**
 * 把用户输入解析为 slash 意图。
 *
 * @param options 解析选项。
 * @returns 解析后的意图。
 */
export declare function resolveSlashCommandInput(options: ResolveSlashCommandOptions): SlashCommandIntent;
//# sourceMappingURL=resolve.d.ts.map