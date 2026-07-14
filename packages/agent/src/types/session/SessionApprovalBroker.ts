/**
 * Session Approval Broker 内部类型。
 *
 * Broker 是单个 Session 内 pending approval 与审批模式的唯一所有者。
 */

import type { SessionApproval } from "@/types/session/SessionApproval.js";
import type { ShellApprovalStatus } from "@downcity/shell";

/** Broker 内部保存的单个 pending approval。 */
export interface SessionPendingApproval {
  /** 对外发布的完整审批快照。 */
  approval: SessionApproval;
  /** 兑现 Shell 等待 Promise 的回调。 */
  resolve: (decision: ShellApprovalStatus) => void;
  /** 审批自动过期定时器。 */
  timer: ReturnType<typeof setTimeout>;
}
