/**
 * `city config` 命令组。
 *
 * 目标（中文）
 * - 提供 downcity.json 的通用读写能力（get/set/unset）。
 * - 提供 alias 写入能力。
 * - 所有输出统一支持 JSON（默认）与可读文本两种模式。
 */
import type { Command } from "commander";
/**
 * 注册 `city config` 命令组。
 */
export declare function registerConfigCommand(program: Command): void;
//# sourceMappingURL=ConfigCommand.d.ts.map