/**
 * `town env` 命令树。
 *
 * 关键点（中文）
 * - `env` 是平台 Env 的资源命令，支持 list/set/delete。
 * - 默认不输出任何 secret value；只在显式 set 时写入值。
 * - 当前只保留平台全局 env，不再区分 agent 私有层。
 */
import type { Command } from "commander";
/**
 * 注册 `town env` 命令组。
 */
export declare function registerEnvCommand(program: Command): void;
//# sourceMappingURL=EnvCommand.d.ts.map