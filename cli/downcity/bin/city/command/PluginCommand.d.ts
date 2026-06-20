/**
 * `city plugin` 命令树入口。
import { runLocalPluginAction } from "@downcity/agent";
 *
 * 关键点（中文）
 * - 负责注册所有 plugin 相关子命令。
 * - 交互式入口委托给 helpers 中的 prompts 与 actions。
 */
import type { Command } from "commander";
export declare function runInteractivePluginManager(): Promise<void>;
/**
 * 注册 `city plugin` 命令组。
 */
export declare function registerPluginsCommand(program: Command): void;
//# sourceMappingURL=PluginCommand.d.ts.map