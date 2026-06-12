/**
 * Shell approval action。
 *
 * 关键点（中文）
 * - 这里只暴露 pending approval 查询与用户决策入口。
 * - 具体 approval event、timeout、audit 仍由 approval 模块负责。
 */

import type { ShellHostContext } from "@/types/ShellHostContext.js";
import type { ShellRuntimeState } from "@/session/ShellRuntimeTypes.js";
import {
  listPendingApprovals,
  resolveApproval,
} from "../../approval/ShellApprovalRuntime.js";

/**
 * 列出 pending unrestricted sandbox 审批。
 */
export function listShellApprovals(state: ShellRuntimeState) {
  return listPendingApprovals(state);
}

/**
 * 批准 pending unrestricted sandbox 审批。
 */
export async function approveShellApproval(
  state: ShellRuntimeState,
  context: ShellHostContext,
  approvalId: string,
): Promise<boolean> {
  return await resolveApproval({
    state,
    context,
    approvalId,
    decision: "approved",
  });
}

/**
 * 拒绝 pending unrestricted sandbox 审批。
 */
export async function denyShellApproval(
  state: ShellRuntimeState,
  context: ShellHostContext,
  approvalId: string,
): Promise<boolean> {
  return await resolveApproval({
    state,
    context,
    approvalId,
    decision: "denied",
  });
}
