/**
 * 受 agent 托管的 plugin action CLI 注册器。
 *
 * 关键点（中文）
 * - 负责把需要运行中 agent 承载的 plugin actions 挂到 commander（`town <plugin> <action>`）。
 * - 仅处理 CLI 参数映射与远程调用，不承载 plugin 状态机逻辑。
 * - 命令注册表与调度时间解析统一复用 agent 包实现，避免 Town 维护第二套事实源。
 */
import type { Command } from "commander";
import type { BasePlugin } from "@downcity/agent";
/**
 * 注册所有受 agent 托管的 plugin actions CLI 命令。
 */
export declare function registerManagedPluginCommandsForCli(program: Command, pluginsInput: BasePlugin[]): void;
//# sourceMappingURL=ManagedPluginActionCommands.d.ts.map