/**
 * ControlPlaneProcess：Town gateway / control plane 命令的 runtime/进程控制辅助。
 *
 * 关键点（中文）
 * - 聚合 control plane 与受管 agent 的后台进程控制逻辑。
 * - 让 `GatewayCommand` 只保留命令树装配，不再混杂大量进程细节。
 */
import type { ManagedAgentProcessView } from "@downcity/agent";
import type { AgentStartOptions } from "../types/AgentStartOptions.js";
/**
 * 启动 town runtime 后台进程。
 */
export declare function startTownRuntimeCommand(cliPath: string): Promise<void>;
/**
 * 解析 control plane 维护的“正在运行” managed agent 列表。
 */
export declare function resolveRunningManagedAgents(params?: {
    /**
     * 是否在扫描过程中回写 registry。
     *
     * 关键点（中文）
     * - `status` 等纯观测命令应关闭该开关，避免只读操作因为目录不可写而失败。
     * - stop/restart 等运维命令仍保留默认同步行为，确保 registry 最终状态收敛。
     */
    syncRegistry?: boolean;
}): Promise<ManagedAgentProcessView[]>;
/**
 * 停止 town runtime 后台进程（先停 Console，再停受管 agent，最后停 town runtime）。
 */
export declare function stopTownRuntimeCommand(params?: {
    timeoutMs?: number;
}): Promise<void>;
/**
 * 重启后恢复此前仍在运行的 agent daemon。
 */
export declare function restartManagedAgents(cliPath: string): Promise<void>;
/**
 * 重启 control plane 主进程。
 */
export declare function restartTownRuntimeCommand(cliPath: string): Promise<void>;
/**
 * 执行 town runtime 常驻进程。
 */
export declare function runTownRuntimeCommand(): Promise<void>;
/**
 * 注册 `agent doctor` 对 managed agent registry 的依赖校验。
 */
export declare function ensureRegisteredAgentProjectRoot(cwd: string): Promise<string>;
/**
 * 为前台 agent 运行补齐上下文与模型绑定。
 */
export declare function prepareForegroundAgent(cwd: string, options: AgentStartOptions & {
    foreground?: boolean;
}): Promise<{
    projectRoot: string;
    options: AgentStartOptions & {
        foreground?: boolean;
    };
    shouldForeground: boolean;
}>;
//# sourceMappingURL=ControlPlaneProcess.d.ts.map