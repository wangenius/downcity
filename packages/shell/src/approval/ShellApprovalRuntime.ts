/**
 * Shell unrestricted sandbox 审批运行时。
 *
 * 关键点（中文）
 * - agent 只能通过 shell tool 请求 unrestricted sandbox；真正执行前必须等待用户确认。
 * - 审批结果最终回到原 tool result；session event 只用于 UI/CLI/Console 展示和操作。
 * - V1 授权粒度固定为单次命令、单次 shell_session 启动，或单次 session 输入。
 */

import fs from "fs-extra";
import path from "node:path";
import { generateId } from "@/utils/Id.js";
import type { ShellHostContext } from "@/types/ShellHostContext.js";
import type {
  ShellApprovalMode,
  ShellApprovalStatus,
  ShellApprovalToolName,
} from "@/types/ShellAction.js";
import type { ShellRuntimeState } from "@/session/ShellRuntimeTypes.js";
import { nowMs } from "../session/ShellActionRuntimeSupport.js";

const DANGEROUS_COMMAND_PATTERNS = [
  /\bsudo\b/,
  /\brm\s+-[^&|;\n]*r[^&|;\n]*f\s+\/(?:\s|$)/,
  /\bchmod\s+-R\s+777\s+\/(?:\s|$)/,
  /\bssh-keygen\b/,
  /\bsecurity\s+(?:add|delete|unlock|set|import|export)-/i,
  /(?:^|[\s;&|])(?:nohup\s+)?[^;&|\n]*(?:&)\s*$/,
];

function isDangerousCommand(cmd: string): boolean {
  return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(cmd));
}

function resolveApprovalOperation(toolName: ShellApprovalToolName): "exec" | "start" | "write" {
  if (toolName === "shell_write") return "write";
  if (toolName === "shell_exec") return "exec";
  return "start";
}

function buildInputPreview(value: string): string {
  const normalized = String(value || "");
  if (normalized.length <= 240) return normalized;
  return `${normalized.slice(0, 240)}...`;
}

function resolveAuditPath(context: ShellHostContext): string {
  return path.join(context.rootPath, ".downcity", "logs", "unrestricted-sandbox-audit.jsonl");
}

async function appendAudit(params: {
  context: ShellHostContext;
  record: Record<string, unknown>;
}): Promise<void> {
  const filePath = resolveAuditPath(params.context);
  await fs.ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(params.record)}\n`, "utf-8");
}

/**
 * 归一化 shell approval 模式。
 */
export function normalizeShellApprovalMode(value: unknown): ShellApprovalMode {
  return value === "always-allow" ? "always-allow" : "ask";
}

/**
 * 读取指定 session 的 shell approval 模式。
 */
export function getShellApprovalMode(params: {
  state: ShellRuntimeState;
  ownerContextId?: string;
}): ShellApprovalMode {
  const ownerContextId = String(params.ownerContextId || "").trim();
  if (!ownerContextId) return "ask";
  return normalizeShellApprovalMode(params.state.approval_modes.get(ownerContextId));
}

/**
 * 列出 shell 支持的 approval 模式。
 */
export function listShellApprovalModes(): Array<{
  mode: ShellApprovalMode;
  label: string;
  description: string;
}> {
  return [
    {
      mode: "ask",
      label: "Ask",
      description: "Ask for approval before each unrestricted shell request.",
    },
    {
      mode: "always-allow",
      label: "Always allow",
      description: "Automatically approve unrestricted shell requests in this session.",
    },
  ];
}

/**
 * 设置指定 session 的 shell approval 模式。
 */
export function setShellApprovalMode(params: {
  state: ShellRuntimeState;
  ownerContextId: string;
  mode: ShellApprovalMode;
}): ShellApprovalMode {
  const ownerContextId = String(params.ownerContextId || "").trim();
  if (!ownerContextId) throw new Error("session_id is required");
  const mode = normalizeShellApprovalMode(params.mode);
  if (mode === "ask") {
    params.state.approval_modes.delete(ownerContextId);
    return "ask";
  }
  params.state.approval_modes.set(ownerContextId, mode);
  return mode;
}

function publishApprovalResult(params: {
  context: ShellHostContext;
  ownerContextId?: string;
  turnId?: string;
  approvalId: string;
  shellId: string;
  toolName: ShellApprovalToolName;
  decision: ShellApprovalStatus;
  toolCallId?: string;
}): void {
  const sessionId = String(params.ownerContextId || "").trim();
  if (!sessionId || !params.context.session) return;
  const turnId = String(params.turnId || sessionId).trim();
  const toolCallId = String(params.toolCallId || params.shellId || "").trim();
  try {
    params.context.session.get(sessionId).publishEvent({
      type: "tool-approval-result",
      turnId,
      toolCallId,
      toolName: params.toolName,
      approvalId: params.approvalId,
      decision: params.decision,
    });
  } catch {
    // ignore event delivery failures
  }
}

/**
 * 校验 unrestricted sandbox 请求。
 */
export function validateUnrestrictedRequest(params: {
  cmd: string;
  reason?: string;
}): string | null {
  const reason = String(params.reason || "").trim();
  if (!reason) {
    return "unrestricted sandbox requires a non-empty reason";
  }
  if (isDangerousCommand(params.cmd)) {
    return "unrestricted sandbox rejected a dangerous command";
  }
  return null;
}

/**
 * 记录 always-allow 模式下的自动批准。
 */
export async function recordAutoApprovedApproval(params: {
  context: ShellHostContext;
  shellId: string;
  toolName: ShellApprovalToolName;
  cmd: string;
  cwd: string;
  reason: string;
  ownerContextId?: string;
  inputPreview?: string;
  inputChars?: number;
  toolCallId?: string;
}): Promise<void> {
  const operation = resolveApprovalOperation(params.toolName);
  const inputPreview = params.inputPreview !== undefined
    ? buildInputPreview(params.inputPreview)
    : undefined;
  const tool_call_id = String(params.toolCallId || params.shellId || "").trim() || null;
  await appendAudit({
    context: params.context,
    record: {
      event: "approval_auto_approved",
      mode: "always-allow",
      session_id: String(params.ownerContextId || "").trim() || null,
      tool_call_id,
      agent_id: params.context.config?.id || null,
      tool_name: params.toolName,
      cmd: params.cmd,
      operation,
      ...(inputPreview !== undefined ? { input_preview: inputPreview } : {}),
      ...(typeof params.inputChars === "number" ? { input_chars: params.inputChars } : {}),
      cwd: params.cwd,
      reason: params.reason,
      created_at: new Date(nowMs()).toISOString(),
    },
  });
}

/**
 * 请求用户批准 unrestricted sandbox 执行。
 */
export async function requestUnrestrictedApproval(params: {
  state: ShellRuntimeState;
  context: ShellHostContext;
  shellId: string;
  toolName: ShellApprovalToolName;
  cmd: string;
  cwd: string;
  reason: string;
  ownerContextId?: string;
  turnId?: string;
  inputPreview?: string;
  inputChars?: number;
  toolCallId?: string;
}): Promise<{
  approvalId: string;
  status: ShellApprovalStatus;
}> {
  const approvalId = `ap_${generateId()}`;
  const createdAt = nowMs();
  const ownerContextId = String(params.ownerContextId || "").trim() || undefined;
  const turnId = String(params.turnId || "").trim() || undefined;
  const toolCallId = String(params.toolCallId || "").trim() || undefined;
  const operation = resolveApprovalOperation(params.toolName);
  const inputPreview = params.inputPreview !== undefined
    ? buildInputPreview(params.inputPreview)
    : undefined;
  const resolvedToolCallId = toolCallId || params.shellId;

  // 关键点（中文）
  // - 没有 ownerContextId 时无法把审批事件发给任何 session，必须直接拒绝，
  //   避免创建 pending approval 后无限挂起直到超时。
  if (!ownerContextId) {
    await appendAudit({
      context: params.context,
      record: {
        event: "approval_rejected_no_owner",
        approval_id: approvalId,
        tool_call_id: resolvedToolCallId,
        agent_id: params.context.config?.id || null,
        tool_name: params.toolName,
        cmd: params.cmd,
        operation,
        ...(inputPreview !== undefined ? { input_preview: inputPreview } : {}),
        ...(typeof params.inputChars === "number" ? { input_chars: params.inputChars } : {}),
        cwd: params.cwd,
        reason: params.reason,
        created_at: new Date(createdAt).toISOString(),
      },
    }).catch(() => undefined);
    return { approvalId, status: "denied" };
  }

  const status = await new Promise<ShellApprovalStatus>((resolve) => {
    const timer = setTimeout(() => {
      resolveApproval({
        state: params.state,
        context: params.context,
        approvalId,
        decision: "expired",
      }).catch(() => undefined);
    }, params.state.options.defaultApprovalTimeoutMs);
    if (typeof timer.unref === "function") timer.unref();

    params.state.approvals.set(approvalId, {
      approvalId,
      shellId: params.shellId,
      ...(ownerContextId ? { ownerContextId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(toolCallId ? { toolCallId } : {}),
      toolName: params.toolName,
      cmd: params.cmd,
      operation,
      ...(inputPreview !== undefined ? { inputPreview } : {}),
      ...(typeof params.inputChars === "number" ? { inputChars: params.inputChars } : {}),
      cwd: params.cwd,
      reason: params.reason,
      createdAt,
      timer,
      resolve,
    });

    const eventTurnId = String(turnId || ownerContextId).trim();
    try {
      params.context.session?.get(ownerContextId).publishEvent({
        type: "tool-approval-request",
        turnId: eventTurnId,
        toolCallId: resolvedToolCallId,
        toolName: params.toolName,
        approvalId,
        sandbox: "unrestricted",
        cmd: params.cmd,
        cwd: params.cwd,
        reason: params.reason,
        status: "pending",
        operation,
        shellId: params.shellId,
        ...(inputPreview !== undefined ? { inputPreview } : {}),
        ...(typeof params.inputChars === "number" ? { inputChars: params.inputChars } : {}),
      });
    } catch {
      // ignore event delivery failures
    }

    appendAudit({
      context: params.context,
      record: {
        event: "approval_requested",
        approval_id: approvalId,
        session_id: ownerContextId || null,
        tool_call_id: resolvedToolCallId,
        agent_id: params.context.config?.id || null,
        cmd: params.cmd,
        operation,
        ...(inputPreview !== undefined ? { input_preview: inputPreview } : {}),
        ...(typeof params.inputChars === "number" ? { input_chars: params.inputChars } : {}),
        cwd: params.cwd,
        reason: params.reason,
        created_at: new Date(createdAt).toISOString(),
      },
    }).catch(() => undefined);
  });

  return { approvalId, status };
}

/**
 * 兑现 unrestricted sandbox 审批。
 */
export async function resolveApproval(params: {
  state: ShellRuntimeState;
  context: ShellHostContext;
  approvalId: string;
  decision: ShellApprovalStatus;
}): Promise<boolean> {
  const approval = params.state.approvals.get(params.approvalId);
  if (!approval) return false;
  params.state.approvals.delete(params.approvalId);
  clearTimeout(approval.timer);
  approval.resolve(params.decision);

  publishApprovalResult({
    context: params.context,
    ownerContextId: approval.ownerContextId,
    turnId: approval.turnId,
    approvalId: approval.approvalId,
    shellId: approval.shellId,
    toolName: approval.toolName,
    decision: params.decision,
    toolCallId: approval.toolCallId,
  });

  await appendAudit({
    context: params.context,
    record: {
      event: "approval_resolved",
      approval_id: approval.approvalId,
      session_id: approval.ownerContextId || null,
      tool_call_id: String(approval.toolCallId || approval.shellId || "").trim() || null,
      agent_id: params.context.config?.id || null,
      cmd: approval.cmd,
      operation: approval.operation,
      ...(approval.inputPreview !== undefined ? { input_preview: approval.inputPreview } : {}),
      ...(typeof approval.inputChars === "number" ? { input_chars: approval.inputChars } : {}),
      cwd: approval.cwd,
      reason: approval.reason,
      decision: params.decision,
      resolved_at: new Date(nowMs()).toISOString(),
    },
  }).catch(() => undefined);

  return true;
}

/**
 * 列出 pending unrestricted sandbox 审批。
 */
export function listPendingApprovals(state: ShellRuntimeState): Array<{
  approvalId: string;
  shellId: string;
  ownerContextId?: string;
  toolName: ShellApprovalToolName;
  cmd: string;
  operation: "exec" | "start" | "write";
  inputPreview?: string;
  inputChars?: number;
  cwd: string;
  reason: string;
  createdAt: number;
}> {
  return Array.from(state.approvals.values()).map((approval) => ({
    approvalId: approval.approvalId,
    shellId: approval.shellId,
    ...(approval.ownerContextId ? { ownerContextId: approval.ownerContextId } : {}),
    toolName: approval.toolName,
    cmd: approval.cmd,
    operation: approval.operation,
    ...(approval.inputPreview !== undefined ? { inputPreview: approval.inputPreview } : {}),
    ...(typeof approval.inputChars === "number" ? { inputChars: approval.inputChars } : {}),
    cwd: approval.cwd,
    reason: approval.reason,
    createdAt: approval.createdAt,
  }));
}
