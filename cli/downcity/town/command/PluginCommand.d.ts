/**
 * `town plugin` 命令组。
 *
 * 关键点（中文）
 * - `town plugin` 提供 Town 侧静态 plugin catalog 入口。
 * - `list/info` 不依赖 agent，只展示内建 plugin 定义与 Town 配置事实。
 * - `action` 仍保留为高级入口，真正执行时依赖具体 agent 项目。
 */
import type { Command } from "commander";
export declare function runInteractivePluginManager(): Promise<void>;
/**
 * 注册 `town plugin` 命令组。
 */
export declare function registerPluginsCommand(program: Command): void;
//# sourceMappingURL=PluginCommand.d.ts.map