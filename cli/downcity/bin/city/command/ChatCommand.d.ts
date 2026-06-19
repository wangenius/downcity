/**
 * `city chat` 命令组入口。
 *
 * 关键点（中文）
 * - 这里先注册裸 `city chat` 的交互式入口。
 * - 具体 chat 会话操作命令由 plugin action 注册器补充到同一个命令组。
 * - City 不在这里注册 chat platform 运行态控制命令。
 */
import type { Command } from "commander";
/**
 * 注册 `city chat` 交互式入口。
 */
export declare function registerChatCommand(program: Command): void;
//# sourceMappingURL=ChatCommand.d.ts.map