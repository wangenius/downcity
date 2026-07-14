/**
 * Shell 对象运行时类型。
 *
 * 关键点（中文）
 * - 这里定义 `new Shell(...)` 对外可见的最小构造参数。
 * - Shell 自己拥有 tools、sessions、sandbox 与 approvals；Agent 只负责提供宿主上下文。
 */

import type { Tool } from "ai";
import type {
  ShellActionResponse,
  ShellApprovalMode,
  ShellApprovalStatus,
} from "@/types/ShellAction.js";

/**
 * Shell 运行时日志器。
 */
export interface ShellRuntimeLogger {
  /**
   * 输出 warning 日志。
   */
  warn(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Shell 事件。
 */
export type ShellEvent = Record<string, unknown>;

/**
 * Shell tool 执行时需要的宿主运行上下文。
 *
 * 关键点（中文）
 * - 显式把 session/turn 上下文传给 Shell action。
 * - 由 Agent 在 tool.execute 入口提供，Shell 内部不再读取隐式全局状态。
 */
export interface ShellToolRunContext {
  /**
   * 当前 tool 调用所属的 agent session id。
   */
  ownerContextId?: string;
  /**
   * 当前 tool 调用所属的 turn id。
   */
  turnId?: string;

  /** 当前 Session step 已提交生效的 Agent env。 */
  env?: Readonly<Record<string, string>>;
}

/**
 * Shell tool 的显式执行上下文。
 *
 * 关键点（中文）
 * - 该对象由宿主在每次 `tool.execute` 时通过 `experimental_context` 传入。
 * - Shell 只读取自己的字段，不感知 Agent 的 SessionRunContext。
 */
export interface ShellToolExecutionContext {
  /** 当前 Shell tool 调用的 session、turn 与 env 快照。 */
  shell_run_context: ShellToolRunContext;
}

/**
 * Shell 构造参数。
 */
export interface ShellOptions {
  /**
   * 项目根目录。未传时由 Agent 构造阶段补齐。
   */
  root_path?: string;
  /**
   * 传给 shell 子进程的基础环境变量。
   */
  env?: Record<string, string | undefined>;
  /**
   * @deprecated Safe Sandbox 边界由 Shell 内部固定，不再支持外部配置。
   */
  sandbox?: never;
  /**
   * 可选日志器。
   */
  logger?: ShellRuntimeLogger;
  /**
   * Shell 事件出口。Agent 会把这些事件转成 session event。
   */
  emit_event?: (event: ShellEvent) => void | Promise<void>;
}

/**
 * Agent 内部补齐给 Shell 的宿主参数。
 */
export interface ShellConfigureOptions extends ShellOptions {
  /**
   * Agent id。
   */
  agent_id?: string;
}

/**
 * Shell approval 视图。
 */
export interface ShellApprovalView {
  /**
   * approval id。
   */
  approval_id: string;
  /**
   * shell session id。
   */
  shell_id: string;
  /**
   * 归属的 agent session id。
   */
  session_id?: string;
  /** 当前审批所属 Turn 标识。 */
  turn_id?: string;
  /** 当前审批对应的工具调用标识。 */
  tool_call_id?: string;
  /**
   * 来源工具名称。
   */
  tool_name: string;
  /**
   * 请求执行的命令或 stdin 文本。
   */
  cmd: string;
  /**
   * 操作类型。
   */
  operation: "exec" | "start" | "write";
  /**
   * stdin 输入预览。
   */
  input_preview?: string;
  /**
   * stdin 输入字符数。
   */
  input_chars?: number;
  /**
   * 工作目录。
   */
  cwd: string;
  /**
   * 申请原因。
   */
  reason: string;
  /**
   * 创建时间戳。
   */
  created_at: number;
}

/**
 * Shell approval 决策结果。
 */
export interface ShellApprovalDecisionResult {
  /**
   * 操作是否命中 pending approval。
   */
  success: boolean;
  /**
   * approval id。
   */
  approval_id: string;
  /**
   * 决策。
   */
  decision: Extract<ShellApprovalStatus, "approved" | "denied">;
}

/**
 * Shell approval 模式选项。
 */
export interface ShellApprovalModeOption {
  /**
   * shell approval 模式。
   */
  mode: ShellApprovalMode;
  /**
   * 展示标签。
   */
  label: string;
  /**
   * 展示说明。
   */
  description: string;
}

/**
 * Shell session approval 模式视图。
 */
export interface ShellSessionApprovalModeView {
  /**
   * 归属的 agent session id。
   */
  session_id: string;
  /**
   * 当前 session 的 shell approval 模式。
   */
  mode: ShellApprovalMode;
}

/**
 * Shell approval 模式更新结果。
 */
export interface ShellApprovalModeUpdateResult extends ShellSessionApprovalModeView {
  /**
   * 操作是否成功。
   */
  success: true;
}

/**
 * Shell tool action 名称。
 */
export type ShellToolAction =
  | "start"
  | "exec"
  | "status"
  | "read"
  | "write"
  | "wait"
  | "close"
  | "list";

/**
 * Shell tool 执行器协议。
 *
 * 关键点（中文）
 * - tool 从 `ToolExecutionOptions.experimental_context` 读取显式运行上下文。
 * - `run_action` 显式携带 session、turn 与 env，Shell 内部不读取隐式全局状态。
 */
export interface ShellToolRunner {
  /**
   * 执行 shell action。
   */
  run_action(params: {
    /**
     * action 名称。
     */
    action: ShellToolAction;
    /**
     * action payload。
     */
    payload: Record<string, unknown>;
    /**
     * 当前 tool 调用所属的 agent session id。
     */
    ownerContextId?: string;
    /**
     * 当前 tool 调用所属的 turn id。
     */
    turnId?: string;
    /** 当前 Session step 已提交生效的环境变量。 */
    env?: Readonly<Record<string, string>>;
    /**
     * AI SDK 分配给当前 tool 调用的 id。
     *
     * 关键点（中文）
     * - tool-approval-request / tool-approval-result 事件需要用它作为 toolCallId，
     *   才能与 tool-call / tool-result 事件对齐。
     */
    toolCallId?: string;
  }): Promise<ShellActionResponse>;
}

type JsonObject = Record<string, unknown>;

/**
 * Shell 工具集合。
 */
export type ShellToolSet = Record<string, Tool>;
