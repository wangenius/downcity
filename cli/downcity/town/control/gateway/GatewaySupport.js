/**
 * 平台控制面网关共享辅助函数。
 *
 * 关键点（中文）
 * - 提供与路由层正交的纯文本/纯 payload 组装能力。
 * - 让 `ControlGateway` 与 route 注册模块不再重复拼接阻塞文案。
 */
/**
 * 生成 workload 阻塞详情文本。
 */
export function buildPlatformWorkloadBlockDetail(checks) {
    const contextLabel = checks.activeContexts.length > 0
        ? `contexts: ${checks.activeContexts.join(", ")}`
        : "";
    const taskLabel = checks.activeTasks.length > 0 ? `tasks: ${checks.activeTasks.join(", ")}` : "";
    return [contextLabel, taskLabel].filter(Boolean).join(" | ");
}
/**
 * 生成 stop/restart 被阻塞时的统一响应 payload。
 */
export function buildPlatformWorkloadBlockPayload(action, checks) {
    const detail = buildPlatformWorkloadBlockDetail(checks);
    return {
        success: false,
        error: detail
            ? `Agent has running workload, ${action} blocked (${detail})`
            : `Agent has running workload, ${action} blocked`,
        activeContexts: checks.activeContexts,
        activeTasks: checks.activeTasks,
    };
}
//# sourceMappingURL=GatewaySupport.js.map