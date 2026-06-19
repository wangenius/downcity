/**
 * `city plugin` 运行态命令共享辅助 + Agent 预检。
 *
 * 关键点（中文）
 * - 统一承载 plugin runtime 命令的参数解析、目标 agent 路径解析与项目目录校验。
 * - 提供 `checkAgentPreflight` 供 start/restart/status 等命令统一使用。
 * - 保持 command 注册层只关注命令树，不再直接承载路径解析细节。
 */
import type { JsonValue } from "@downcity/agent";
import type { ActionScheduleJobStatus } from "@downcity/agent";
import type { PluginCliBaseOptions } from "@downcity/agent";
export declare function isRegistryEntryRunning(entry: {
    status?: "running" | "stopped";
}): boolean;
/**
 * Agent 启动前预检选项。
 */
export interface AgentPreflightOptions {
    /** 是否要求 city runtime 已运行。 */
    requireCityRunning?: boolean;
    /** 是否检查 shell sandbox 宿主依赖。 */
    requireShellSandbox?: boolean;
}
/**
 * 检查本机 shell sandbox 依赖。
 */
export declare function checkShellSandboxHostPreflight(): Promise<void>;
/**
 * Agent 启动前统一预检。
 *
 * 关键点（中文）
 * - 收敛 start/restart/status 等命令的前置校验逻辑。
 * - 按顺序检查，首个失败即抛 CliError（City running → PROFILE.md → downcity.json → binding）。
 *
 * @throws {CliError} 任一校验失败时抛出。
 */
export declare function checkAgentPreflight(projectRoot: string, options?: AgentPreflightOptions): Promise<void>;
/**
 * 解析正整数参数。
 */
export declare function parsePositiveIntOption(value: string, fieldName: string): number;
/**
 * 归一化 schedule 状态过滤参数。
 */
export declare function normalizeScheduledJobStatus(value: string | undefined): ActionScheduleJobStatus | undefined;
/**
 * 解析项目根目录。
 */
export declare function resolveProjectRoot(pathInput?: string): string;
/**
 * 通过 agent id 解析 projectRoot。
 */
export declare function resolveProjectRootByAgentId(agentId: string): Promise<{
    projectRoot?: string;
    error?: string;
}>;
/**
 * 统一解析 plugin runtime 命令目标路径（agent 优先于 path）。
 */
export declare function resolvePluginProjectRoot(options: PluginCliBaseOptions): Promise<{
    projectRoot?: string;
    error?: string;
}>;
/**
 * 解析 ActionSchedule 管理命令目标路径。
 */
export declare function resolvePluginScheduleProjectRoot(options: PluginCliBaseOptions): Promise<{
    projectRoot?: string;
    error?: string;
}>;
/**
 * 校验路径是否为有效 agent 项目目录。
 */
export declare function validateAgentProjectRoot(projectRoot: string): string | null;
/**
 * 解析 plugin command payload。
 */
export declare function parseCommandPayload(raw?: string): JsonValue | undefined;
//# sourceMappingURL=PluginTargetSupport.d.ts.map