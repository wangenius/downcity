/**
 * Town 根命令装配模块。
 *
 * 关键点（中文）
 * - `town` 只负责本机 Agent 宿主能力，不再混入 City 管理入口。
 * - Agent 生命周期、chat 与 plugin 命令仍按模块装配，避免入口文件膨胀。
 * - City 运维能力统一进入 `city` 命令。
 * - 本模块承载 commander 根命令，`src/index.ts` 只负责进程入口。
 */
import { Command } from "commander";
/**
 * 注册 Town 命令到给定的 commander 命令组。
 *
 * 关键点（中文）
 * - 将 Town 的所有子命令注册到传入的 `town` command 对象上。
 * - 这样 `city town` 和独立的 `town` 命令可以复用同一套命令注册逻辑。
 */
export declare function registerTownCommands(town: Command): void;
/**
 * 执行 Town CLI（独立入口模式）。
 *
 * 关键点（中文）
 * - 当用户直接执行 `town` 命令时调用。
 * - 创建自己的 commander program 并注册所有 Town 命令。
 */
export declare function runTownCli(): Promise<void>;
//# sourceMappingURL=RootCommand.d.ts.map