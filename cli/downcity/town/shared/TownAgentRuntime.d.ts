/**
 * Town Agent runtime 辅助模块。
 *
 * 关键点（中文）
 * - Town 负责本机 Agent 宿主能力，不能再从 City control-plane 源码导入 helper。
 * - 这里只保留 Town 启动/列表/前台运行需要的最小运行态逻辑。
 * - City 管理命令仍通过 `city` 入口负责。
 */
import type { ManagedAgentProcessView } from "@downcity/agent";
import type { AgentStartOptions } from "@/types/AgentStartOptions.js";
/**
 * 解析当前仍在运行的 managed agent。
 */
export declare function resolveRunningManagedAgents(params?: {
    /**
     * 是否在扫描过程中回写 registry。
     */
    syncRegistry?: boolean;
}): Promise<ManagedAgentProcessView[]>;
/**
 * 确认目标 agent 已登记到 Town registry。
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
//# sourceMappingURL=TownAgentRuntime.d.ts.map