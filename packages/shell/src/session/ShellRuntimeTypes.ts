/**
 * ShellRuntime 类型定义。
 *
 * 关键点（中文）
 * - 这些类型描述 shell runtime 的实例级运行态。
 * - 状态所有权归属于 `Shell` 实例，而不是模块级单例。
 * - 统一归档到 `src/shell/` 相邻层级，避免继续分散在跨域目录里。
 */

import type { ShellHostContext } from "@/types/ShellHostContext.js";
import type { ShellProcessHandle } from "@/sandbox/types/SandboxRuntime.js";
import type {
  ShellApprovalMode,
  ShellApprovalStatus,
  ShellApprovalToolName,
  ShellSessionSnapshot,
} from "@/types/ShellAction.js";
import type { ResolvedShellRuntimeOptions } from "@/types/ShellRuntimeOptions.js";

/**
 * unrestricted sandbox 审批运行态。
 */
export type ShellApprovalRuntimeState = {
  /**
   * 当前审批请求 ID。
   */
  approvalId: string;
  /**
   * 关联的 shell_id。
   */
  shellId: string;
  /**
   * 所属 session/聊天上下文。
   */
  ownerContextId?: string;
  /**
   * 当前审批所属的 turn id；用于发布 approval 事件。
   */
  turnId?: string;
  /**
   * 当前审批对应的 AI SDK tool call id；用于对齐 tool-call / tool-result 事件。
   */
  toolCallId?: string;
  /**
   * 关联工具名。
   */
  toolName: ShellApprovalToolName;
  /**
   * 申请执行的命令。
   *
   * 说明（中文）
   * - `shell_write` 使用该字段保存 stdin 写入预览，保持审批队列结构统一。
   */
  cmd: string;
  /**
   * 审批动作类型。
   */
  operation: "exec" | "start" | "write";
  /**
   * stdin 写入内容预览；仅 `shell_write` 审批存在。
   */
  inputPreview?: string;
  /**
   * stdin 写入字符数；仅 `shell_write` 审批存在。
   */
  inputChars?: number;
  /**
   * 命令执行目录。
   */
  cwd: string;
  /**
   * 申请原因。
   */
  reason: string;
  /**
   * 当前审批创建时间。
   */
  createdAt: number;
  /**
   * 审批超时定时器。
   */
  timer: NodeJS.Timeout;
  /**
   * 兑现审批结果。
   */
  resolve: (status: ShellApprovalStatus) => void;
};

/**
 * 单个 shell wait 调用挂起时注册的 waiter。
 */
export type ShellSessionWaiter = {
  /**
   * 当前等待完成后的唤醒回调。
   */
  resolve: () => void;
  /**
   * 当前 waiter 对应的超时定时器。
   */
  timer: NodeJS.Timeout;
};

/**
 * 单个 shell session 的内存运行态。
 */
export type ShellSessionRuntimeState = {
  /**
   * 当前 shell session 的对外快照。
   */
  snapshot: ShellSessionSnapshot;
  /**
   * 当前 shell session 对应的子进程句柄。
   */
  child: ShellProcessHandle;
  /**
   * 当前已缓存的标准输出与标准错误文本。
   */
  outputText: string;
  /**
   * 当前输出持久化文件路径。
   */
  outputFilePath: string;
  /**
   * 当前快照持久化文件路径。
   */
  snapshotFilePath: string;
  /**
   * 串行化文件写入链，避免并发 append 乱序。
   */
  writeChain: Promise<void>;
  /**
   * 终态后的延迟清理定时器。
   */
  cleanupTimer: NodeJS.Timeout | null;
  /**
   * 当前挂起等待该 session 状态变化的 waiter 集合。
   */
  waiters: Set<ShellSessionWaiter>;
  /**
   * 当前 shell 进入终态后的完成 promise。
   *
   * 关键点（中文）
   * - 供 `shell.exec` 这类 one-shot 路径直接等待进程结束。
   * - 这样可以减少对版本轮询的依赖，降低瞬时命令的竞态超时。
   */
  completionPromise: Promise<void>;
  /**
   * 当前 shell 进入终态时触发的完成回调。
   */
  resolveCompletion: () => void;
};

/**
 * `Shell` 实例级状态。
 */
export type ShellRuntimeState = {
  /**
   * 当前 shell 归一化后的运行参数。
   */
  options: ResolvedShellRuntimeOptions;
  /**
   * 当前实例持有的全部 in-memory shell session。
   */
  sessions: Map<string, ShellSessionRuntimeState>;
  /**
   * 当前实例持有的全部 pending unrestricted sandbox 审批。
   */
  approvals: Map<string, ShellApprovalRuntimeState>;
  /**
   * 当前实例内按 owner session 保存的 approval 模式。
   *
   * 说明（中文）
   * - key 是 chat/session id，value 是当前 session 的 shell approval 策略。
   * - 不存在时等价于默认 `ask`。
   */
  approval_modes: Map<string, ShellApprovalMode>;
  /**
   * 当前实例最近一次启动时绑定的 agent context。
   *
   * 关键点（中文）
   * - 仅用于 shell 自动通知 chat 的回调路径。
   * - 这是实例字段，不再是模块级全局变量。
   */
  context: ShellHostContext | null;
};
