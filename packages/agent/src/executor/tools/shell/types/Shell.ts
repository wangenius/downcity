/**
 * Shell tool 输入类型兼容出口。
 *
 * 关键点（中文）
 * - shell 领域类型已迁移到 `@downcity/shell`。
 * - 当前文件保留 agent internal 旧路径，避免一次性打断内部调用方。
 */

export type {
  ShellCloseInput,
  ShellExecInput,
  ShellReadInput,
  ShellSandboxMode,
  ShellStartInput,
  ShellStatusInput,
  ShellUnrestrictedReason,
  ShellWaitInput,
  ShellWriteInput,
} from "@downcity/shell/types/Shell.js";
