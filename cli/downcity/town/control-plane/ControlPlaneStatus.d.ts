/**
 * ControlPlaneStatus：Town gateway / control plane 命令的状态展示辅助。
 *
 * 关键点（中文）
 * - 聚合 town 后台、gateway/control plane 与受管 agent 的状态面板输出。
 * - 与进程控制逻辑解耦，便于后续继续拆分命令入口文件。
 */
import type { ManagedAgentProcessView } from "@downcity/agent";
/**
 * 打印当前受管 agent 面板。
 */
export declare function printRunningManagedAgents(views: ManagedAgentProcessView[]): void;
/**
 * 打印 town 后台、control plane 与受管 agent 的状态面板。
 */
export declare function controlPlaneStatusCommand(): Promise<void>;
/**
 * 打印 control plane 独立状态面板。
 */
export declare function printControlPlaneStatusPanel(status: {
    running: boolean;
    pid?: number;
    pidPath: string;
    logPath: string;
    url?: string;
}): void;
//# sourceMappingURL=ControlPlaneStatus.d.ts.map