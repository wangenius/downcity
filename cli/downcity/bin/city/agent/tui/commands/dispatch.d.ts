/**
 * city agent chat TUI slash 命令分发器。
 */
import type { SlashCommandHost } from "../../../../city/agent/tui/commands/host.js";
import type { SlashCommandIntent } from "../../../../city/agent/tui/commands/types.js";
/**
 * 分发并执行 slash 命令意图。
 *
 * @param host slash 命令宿主。
 * @param intent 解析后的意图。
 */
export declare function dispatchSlashCommand(host: SlashCommandHost, intent: SlashCommandIntent): Promise<void>;
//# sourceMappingURL=dispatch.d.ts.map