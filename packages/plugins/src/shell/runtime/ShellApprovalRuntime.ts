/**
 * Shell unrestricted sandbox 审批运行时。
 *
 * 关键点（中文）
 * - agent 只能通过 shell tool 请求 unrestricted sandbox；真正执行前必须等待用户确认。
 * - 审批结果最终回到原 tool result；session event 只用于 UI/CLI/Console 展示和操作。
 * - V1 授权粒度固定为单次命令、单次 shell_start 启动，或单次 shell_write 输入。
 */

import fs from "fs-extra";
import path from "node:path";
import { generateId } from "@downcity/agent/internal/utils/Id.js";
import { getSessionRunContext } from "@downcity/agent/internal/executor/SessionRunScope.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type {
  ShellApprovalStatus,
  ShellApprovalToolName,
} from "@downcity/agent/internal/executor/tools/shell/types/ShellPlugin.js";
import type { ShellPluginState } from "@/shell/ShellRuntimeTypes.js";
import { nowMs } from "./ShellActionRuntimeSupport.js";

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

function resolveAuditPath(context: AgentContext): string {
  return path.join(context.rootPath, ".downcity", "logs", "unrestricted-sandbox-audit.jsonl");
}

async function appendAudit(params: {
  context: AgentContext;
  record: Record<string, unknown>;
}): Promise<void> {
  const filePath = resolveAuditPath(params.context);
  await fs.ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(params.record)}\n`, "utf-8");
}

function publishApprovalResult(params: {
  context: AgentContext;
  ownerContextId?: string;
  approvalId: string;
  shellId: string;
  toolName: ShellApprovalToolName;
  decision: ShellApprovalStatus;
}): void {
  const sessionId = String(params.ownerContextId || "").trim();
  if (!sessionId) return;
  const turnId = String(getSessionRunContext()?.turnId || sessionId).trim();
  try {
    params.context.session.get(sessionId).publishEvent({
      type: "tool-approval-result",
      turnId,
      toolCallId: params.shellId,
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
 * 请求用户批准 unrestricted sandbox 执行。
 */
export async function requestUnrestrictedApproval(params: {
  state: ShellPluginState;
  context: AgentContext;
  shellId: string;
  toolName: ShellApprovalToolName;
  cmd: string;
  cwd: string;
  reason: string;
  ownerContextId?: string;
  inputPreview?: string;
  inputChars?: number;
}): Promise<{
  approvalId: string;
  status: ShellApprovalStatus;
}> {
  const approvalId = `ap_${generateId()}`;
  const createdAt = nowMs();
  const ownerContextId = String(params.ownerContextId || "").trim() || undefined;
  const operation = resolveApprovalOperation(params.toolName);
  const inputPreview = params.inputPreview !== undefined
    ? buildInputPreview(params.inputPreview)
    : undefined;

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

    if (ownerContextId) {
      const turnId = String(getSessionRunContext()?.turnId || ownerContextId).trim();
      try {
        params.context.session.get(ownerContextId).publishEvent({
          type: "tool-approval-request",
          turnId,
          toolCallId: params.shellId,
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
    }

    appendAudit({
      context: params.context,
      record: {
        event: "approval_requested",
        approval_id: approvalId,
        session_id: ownerContextId || null,
        tool_call_id: params.shellId,
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
  state: ShellPluginState;
  context: AgentContext;
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
    approvalId: approval.approvalId,
    shellId: approval.shellId,
    toolName: approval.toolName,
    decision: params.decision,
  });

  await appendAudit({
    context: params.context,
    record: {
      event: "approval_resolved",
      approval_id: approval.approvalId,
      session_id: approval.ownerContextId || null,
      tool_call_id: approval.shellId,
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
export function listPendingApprovals(state: ShellPluginState): Array<{
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
