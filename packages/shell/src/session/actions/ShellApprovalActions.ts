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
  getShellApprovalMode,
  listShellApprovalModes,
  listPendingApprovals,
  normalizeShellApprovalMode,
  resolveApproval,
  setShellApprovalMode,
} from "../../approval/ShellApprovalRuntime.js";
import type { ShellApprovalMode } from "@/types/ShellAction.js";

/**
 * 列出 pending unrestricted sandbox 审批。
 */
export function listShellApprovals(state: ShellRuntimeState) {
  return listPendingApprovals(state);
}

/**
 * 列出所有显式设置过的 shell approval 模式。
 */
export function listShellApprovalModeViews(state: ShellRuntimeState) {
  void state;
  return listShellApprovalModes();
}

/**
 * 读取指定 session 的 shell approval 模式。
 */
export function getShellApprovalModeView(
  state: ShellRuntimeState,
  sessionId: string,
): ShellApprovalMode {
  return getShellApprovalMode({
    state,
    ownerContextId: sessionId,
  });
}

/**
 * 设置指定 session 的 shell approval 模式。
 */
export function setShellApprovalModeView(
  state: ShellRuntimeState,
  sessionId: string,
  mode: ShellApprovalMode,
): ShellApprovalMode {
  return setShellApprovalMode({
    state,
    ownerContextId: sessionId,
    mode: normalizeShellApprovalMode(mode),
  });
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
