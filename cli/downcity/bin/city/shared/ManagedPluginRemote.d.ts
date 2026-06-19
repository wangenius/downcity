/**
 * `city plugin` 运行态远程 Agent runtime 调用辅助。
 *
 * 关键点（中文）
 * - 统一处理 list/control/command 三类需要访问 Agent runtime 的命令。
 * - 这里不负责命令注册，只负责 transport 调用与结果输出。
 */
import type { PluginCliBaseOptions, PluginControlAction } from "@downcity/agent";
/**
 * 执行 `plugin list`。
 */
export declare function runManagedPluginListCommand(options: PluginCliBaseOptions): Promise<void>;
/**
 * 执行 `plugin status/start/stop/restart`。
 */
export declare function runManagedPluginControlCommand(params: {
    pluginName: string;
    action: PluginControlAction;
    options: PluginCliBaseOptions;
}): Promise<void>;
/**
 * 执行 `plugin command` 桥接。
 */
export declare function runManagedPluginCommandBridge(params: {
    pluginName: string;
    command: string;
    payloadRaw?: string;
    options: PluginCliBaseOptions;
}): Promise<void>;
//# sourceMappingURL=ManagedPluginRemote.d.ts.map