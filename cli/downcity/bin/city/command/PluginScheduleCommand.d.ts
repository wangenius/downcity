/**
 * `city plugin schedule` 命令。
 *
 * 关键点（中文）
 * - 命令名保留 schedule，是用户侧“延迟执行任务”的操作语义。
 * - 内部使用 Agent 的 ActionScheduleStore，不依赖独立 schedule plugin。
 * - 这里同时承载 schedule 子命令注册与 ActionSchedule 本地存储读写流程。
 */
import type { Command } from "commander";
import type { PluginCliBaseOptions } from "@downcity/agent";
/**
 * 执行 `plugin schedule list`。
 */
export declare function runPluginScheduleListCommand(params: {
    options: PluginCliBaseOptions;
    statusRaw?: string;
    limitRaw?: string;
}): Promise<void>;
/**
 * 执行 `plugin schedule info`。
 */
export declare function runPluginScheduleInfoCommand(params: {
    jobId: string;
    options: PluginCliBaseOptions;
}): Promise<void>;
/**
 * 执行 `plugin schedule cancel`。
 */
export declare function runPluginScheduleCancelCommand(params: {
    jobId: string;
    options: PluginCliBaseOptions;
}): Promise<void>;
/**
 * 注册 `plugin schedule` 子命令组。
 */
export declare function registerPluginScheduleCommands(plugin: Command): void;
//# sourceMappingURL=PluginScheduleCommand.d.ts.map