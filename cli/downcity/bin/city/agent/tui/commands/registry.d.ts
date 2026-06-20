/**
 * city agent chat TUI 内置 slash 命令注册表。
 */
import type { SlashCommand } from "../../../../city/agent/tui/commands/types.js";
/**
 * 内置 slash 命令列表。
 */
export declare const BUILTIN_SLASH_COMMANDS: readonly SlashCommand[];
/**
 * 根据名称查找内置 slash 命令（支持别名）。
 *
 * @param name 命令名称或别名。
 * @returns 匹配的命令；未找到时返回 undefined。
 */
export declare function findBuiltInSlashCommand(name: string): SlashCommand | undefined;
//# sourceMappingURL=registry.d.ts.map