/**
 * Session 级工具审批类型。
 *
 * 审批由具体工具运行时执行，但归属、查询和决策能力统一通过 Session 暴露。
 */

/** Session 工具审批的最终人工决策。 */
export type SessionApprovalDecision = "approved" | "denied";

/** Session 工具审批模式。 */
export type SessionApprovalMode = "ask" | "always-allow";

/** 当前 Session 的待审批工具请求。 */
export interface SessionApproval {
  /** 当前审批请求的稳定唯一标识。 */
  approval_id: string;
  /** 当前审批所属 Session 标识。 */
  session_id: string;
  /** 当前审批所属 Turn 标识。 */
  turn_id: string;
  /** 当前审批对应的工具调用标识。 */
  tool_call_id: string;
  /** 当前审批对应的工具注册名称。 */
  tool_name: string;
  /** 请求执行的命令或输入文本。 */
  command: string;
  /** 当前工具执行工作目录。 */
  cwd: string;
  /** 工具申请 unrestricted 权限的原因。 */
  reason: string;
  /** 当前审批对应的工具操作类型。 */
  operation: "exec" | "start" | "write";
  /** 当前审批创建时间戳（ms）。 */
  created_at: number;
  /** 当前审批自动过期时间戳（ms）。 */
  expires_at: number;
}

/** 提交 Session 工具审批决策的参数。 */
export interface ResolveSessionApprovalInput {
  /** 需要处理的审批请求标识。 */
  approval_id: string;
  /** 对当前审批请求作出的最终决定。 */
  decision: SessionApprovalDecision;
}

/** Session 工具审批决策结果。 */
export interface SessionApprovalResult {
  /** 是否成功命中并处理 pending 审批。 */
  success: boolean;
  /** 已尝试处理的审批请求标识。 */
  approval_id: string;
  /** 已提交的最终审批决定。 */
  decision: SessionApprovalDecision;
}

/** 当前 Session 的审批模式快照。 */
export interface SessionApprovalModeSnapshot {
  /** 当前审批模式所属 Session 标识。 */
  session_id: string;
  /** 当前 Session 生效的审批模式。 */
  mode: SessionApprovalMode;
}

/** 更新当前 Session 审批模式的参数。 */
export interface SetSessionApprovalModeInput {
  /** 需要设置的新审批模式。 */
  mode: SessionApprovalMode;
}
