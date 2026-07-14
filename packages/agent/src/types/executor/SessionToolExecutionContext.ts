/**
 * Session tool 显式执行上下文。
 *
 * 关键点（中文）
 * - 该对象由 Executor 在每个 Session step 绑定到 tool.execute。
 * - Agent 工具读取 session_run_context，Shell 工具只读取 shell_run_context。
 * - 上下文归属单次 run，不通过进程级或异步全局容器共享。
 */

import type { ShellToolRunContext } from "@downcity/shell/types/ShellRuntime.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";

/**
 * Agent 与 Shell 工具共用的单次执行上下文。
 */
export interface SessionToolExecutionContext {
  /** 当前 Shell tool 调用的显式上下文。 */
  shell_run_context: ShellToolRunContext;
  /** 当前工具调用所属的完整 Session run 上下文。 */
  session_run_context: SessionRunContext;
}
