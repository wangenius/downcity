/**
 * 平台 agent 动作辅助。
 *
 * 关键点（中文）
 * - 聚合 agent 进程控制、目录选择、命令执行等带副作用能力。
 * - 与只读目录查询分离，降低网关主入口复杂度。
 */
import type { PlatformAgentOption } from "@downcity/agent";
import type { AgentProjectInitializationResult } from "@downcity/agent";
/**
 * 初始化平台控制面选中的 agent 项目。
 */
export declare function initializePlatformAgentProject(params: {
    projectRoot: string;
    id?: unknown;
    modelId?: unknown;
    forceOverwriteShipJson?: unknown;
}): Promise<AgentProjectInitializationResult>;
/**
 * 更新现有 agent 的执行绑定配置。
 */
export declare function updatePlatformAgentExecution(params: {
    projectRoot: string;
    modelId?: unknown;
}): Promise<{
    projectRoot: string;
    modelId: string;
}>;
/**
 * 调起系统目录选择器。

/**
 * 调起系统目录选择器。
 */
export declare function pickPlatformAgentDirectoryPath(): Promise<string>;
/**
 * 在 agent 项目目录中执行 shell 命令。
 */
export declare function executeAgentProjectShellCommand(params: {
    command: string;
    cwd: string;
    timeoutMs: number;
}): Promise<{
    command: string;
    cwd: string;
    exitCode: number | null;
    signal: string;
    timedOut: boolean;
    durationMs: number;
    stdout: string;
    stderr: string;
}>;
/**
 * 启动指定 agent。
 */
export declare function startManagedAgentByProjectRoot(params: {
    projectRoot: string;
    cliPath: string;
    initializeIfNeeded?: boolean;
    initialization?: {
        id?: unknown;
        modelId?: unknown;
        forceOverwriteShipJson?: unknown;
    };
}): Promise<{
    success: boolean;
    projectRoot: string;
    started: boolean;
    pid?: number;
    logPath?: string;
    message?: string;
}>;
/**
 * 检查 agent 重启/停止前是否存在运行中工作负载。
 */
export declare function inspectManagedAgentRestartSafety(params: {
    projectRoot: string;
    listKnownAgents: () => Promise<PlatformAgentOption[]>;
}): Promise<{
    activeContexts: string[];
    activeTasks: string[];
}>;
/**
 * 重启指定 agent。
 */
export declare function restartManagedAgentByProjectRoot(params: {
    projectRoot: string;
    cliPath: string;
}): Promise<{
    success: boolean;
    projectRoot: string;
    restarted: boolean;
    pid?: number;
    logPath?: string;
    message?: string;
}>;
/**
 * 停止指定 agent。
 */
export declare function stopManagedAgentByProjectRoot(projectRoot: string): Promise<{
    success: boolean;
    projectRoot: string;
    stopped: boolean;
    pid?: number;
    message?: string;
}>;
//# sourceMappingURL=AgentActions.d.ts.map