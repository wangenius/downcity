/**
 * `town chat` 命令组入口。
 *
 * 关键点（中文）
 * - 这里先注册裸 `town chat` 的交互式入口。
 * - 具体 plugin runtime actions/lifecycle 命令仍由 plugin runtime 注册器补充到同一个命令组。
 */
import type { Command } from "commander";
/**
 * 注册 `town chat` 交互式入口。
 */
export declare function registerChatCommand(program: Command): void;
//# sourceMappingURL=ChatCommand.d.ts.map