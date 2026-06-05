/**
 * `town token` 命令树。
 *
 * 关键点（中文）
 * - token 管理只允许在本机 CLI 执行，不再暴露用户名密码登录流。
 * - 根命令支持交互式入口，减少用户记忆负担。
 * - 子命令依旧保留脚本友好的非交互模式，便于自动化调用。
 */
import type { Command } from "commander";
/**
 * 注册 `town token` 命令。
 */
export declare function registerTokenCommand(program: Command): void;
//# sourceMappingURL=TokenCommand.d.ts.map