/**
 * 平台控制面网关共享辅助函数。
 *
 * 关键点（中文）
 * - 提供与路由层正交的纯文本/纯 payload 组装能力。
 * - 让 `GatewayServer` 与 route 注册模块不再重复拼接阻塞文案。
 */
/**
 * 平台工作负载安全检查结果。
 */
export interface PlatformWorkloadSafetyCheck {
    /**
     * 当前仍在运行的上下文列表。
     */
    activeContexts: string[];
    /**
     * 当前仍在运行的任务列表。
     */
    activeTasks: string[];
}
/**
 * 生成 workload 阻塞详情文本。
 */
export declare function buildPlatformWorkloadBlockDetail(checks: PlatformWorkloadSafetyCheck): string;
/**
 * 生成 stop/restart 被阻塞时的统一响应 payload。
 */
export declare function buildPlatformWorkloadBlockPayload(action: "stop" | "restart", checks: PlatformWorkloadSafetyCheck): {
    success: false;
    error: string;
    activeContexts: string[];
    activeTasks: string[];
};
//# sourceMappingURL=GatewaySupport.d.ts.map