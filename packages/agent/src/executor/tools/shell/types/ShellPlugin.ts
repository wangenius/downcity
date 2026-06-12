/**
 * Shell plugin 协议类型兼容出口。
 *
 * 关键点（中文）
 * - shell action/session/approval 类型已迁移到 `@downcity/shell`。
 * - 当前文件保留 agent internal 旧路径，作为迁移期适配层。
 */

export type {
  ShellActionResponse,
  ShellApprovalStatus,
  ShellApprovalToolName,
  ShellCloseRequest,
  ShellExecRequest,
  ShellExternalRef,
  ShellOutputChunk,
  ShellQueryRequest,
  ShellReadRequest,
  ShellSandboxMode,
  ShellSessionSnapshot,
  ShellSessionStatus,
  ShellStartRequest,
  ShellWaitRequest,
  ShellWriteRequest,
} from "@downcity/shell/types/ShellPlugin.js";
