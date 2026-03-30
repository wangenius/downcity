/**
 * Console UI gateway 共享辅助函数。
 *
 * 关键点（中文）
 * - 提供与路由层正交的纯文本/纯 payload 组装能力。
 * - 让 `ConsoleUIGateway` 与 route 注册模块不再重复拼接阻塞文案。
 */

/**
 * Console UI workload 安全检查结果。
 */
export interface ConsoleUiWorkloadSafetyCheck {
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
export function buildConsoleUiWorkloadBlockDetail(
  checks: ConsoleUiWorkloadSafetyCheck,
): string {
  const contextLabel =
    checks.activeContexts.length > 0
      ? `contexts: ${checks.activeContexts.join(", ")}`
      : "";
  const taskLabel =
    checks.activeTasks.length > 0 ? `tasks: ${checks.activeTasks.join(", ")}` : "";
  return [contextLabel, taskLabel].filter(Boolean).join(" | ");
}

/**
 * 生成 stop/restart 被阻塞时的统一响应 payload。
 */
export function buildConsoleUiWorkloadBlockPayload(
  action: "stop" | "restart",
  checks: ConsoleUiWorkloadSafetyCheck,
): {
  success: false;
  error: string;
  activeContexts: string[];
  activeTasks: string[];
} {
  const detail = buildConsoleUiWorkloadBlockDetail(checks);
  return {
    success: false,
    error: detail
      ? `Agent has running workload, ${action} blocked (${detail})`
      : `Agent has running workload, ${action} blocked`,
    activeContexts: checks.activeContexts,
    activeTasks: checks.activeTasks,
  };
}
