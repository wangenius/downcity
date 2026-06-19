/**
 * GatewayStatus：City runtime 命令的状态展示辅助。
 *
 * 关键点（中文）
 * - 聚合 city 后台、City 连接与受管 agent 的状态面板输出。
 * - Console UI 已从 City 启动链路断开，因此总览不再展示 Console 运行态。
 * - 与进程控制逻辑解耦，便于后续继续拆分命令入口文件。
 */
import type { ManagedAgentProcessView } from "@downcity/agent";
/**
 * 打印当前受管 agent 面板。
 */
export declare function printRunningManagedAgents(views: ManagedAgentProcessView[]): void;
/**
 * 打印 city 后台、City 连接与受管 agent 的状态面板。
 */
export declare function gatewayStatusCommand(): Promise<void>;
//# sourceMappingURL=GatewayStatus.d.ts.map