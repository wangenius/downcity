/**
 * `city plugin` 命令组。
 *
 * 关键点（中文）
 * - `city plugin` 提供 Agent 内部 plugin 目录入口。
 * - `list/info` 不依赖 agent，只展示内建 plugin 定义事实。
 * - City 不承载 plugin 运行态；运行态归属于具体 agent。
 * - `action` 仍保留为高级入口，真正执行时依赖具体 agent 项目。
 */
import type { Command } from "commander";
export declare function runInteractivePluginManager(): Promise<void>;
/**
 * 注册 `city plugin` 命令组。
 */
export declare function registerPluginsCommand(program: Command): void;
//# sourceMappingURL=PluginCommand.d.ts.map