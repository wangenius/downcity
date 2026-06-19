/**
 * Downcity 本地 City 根命令装配模块。
 *
 * 关键点（中文）
 * - `downcity`（别名 `city`）是本机 Agent 宿主命令，负责 Agent 生命周期、chat、plugin、gateway 等能力。
 * - Federation 运维能力（create / deploy / manage / env）统一进入 `downfed` 命令。
 * - 无参数时进入交互式 City 管理 TUI。
 * - 本模块承载 commander 根命令，`src/index.ts` 只负责进程入口分发。
 */
import { Command } from "commander";
/**
 * 注册 downcity 子命令到给定的 commander 命令组。
 *
 * 关键点（中文）
 * - 将本地 Agent 宿主所需的全部子命令注册到传入的 program 上。
 * - 子命令实现统一放在 `src/city/command/`，本函数只负责装配。
 */
export declare function registerCityCommands(program: Command): void;
/**
 * 执行 downcity CLI。
 *
 * 关键点（中文）
 * - 当用户执行 `downcity` 或 `city` 命令时调用。
 * - 无参数时进入全屏交互式 City 管理界面。
 */
export declare function runDowncityCli(): Promise<void>;
//# sourceMappingURL=RootCommand.d.ts.map