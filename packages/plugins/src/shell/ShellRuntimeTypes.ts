/**
 * Shell runtime 类型兼容出口。
 *
 * 关键点（中文）
 * - shell runtime 类型已迁移到 `@downcity/shell`。
 * - 当前文件保留 plugins 旧路径，避免一次性打断内部 import。
 */

export type {
  ShellApprovalRuntimeState,
  ShellPluginState,
  ShellSessionRuntimeState,
  ShellSessionWaiter,
} from "@downcity/shell/session/ShellRuntimeTypes.js";
