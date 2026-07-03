/**
 * SandboxRuntime 类型定义。
 *
 * 关键点（中文）
 * - 这里放的是 agent 执行层内部使用的最小 sandbox 运行时类型。
 * - 当前只围绕 agent 级 sandbox spawn 设计，不引入复杂 provider / policy / binding 对象。
 * - 目标是让 shell、task script 等本地执行入口都能复用同一个 agent sandbox 边界。
 */

import type { SandboxConfig } from "@/sandbox/types/Sandbox.js";
import type { SandboxNetworkMode } from "@/sandbox/types/Sandbox.js";

/**
 * 当前内置支持的 sandbox backend。
 */
export type SandboxBackend = "macos-seatbelt" | "linux-bubblewrap" | "unrestricted-host";

/**
 * sandbox 会话状态。
 *
 * 说明（中文）
 * - `shell_exec` 这类 one-shot 命令通常会很快走到终态。
 * - `shell_session` 则会维持一个状态化 sandbox session。
 */
export type SandboxSessionStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "killed"
  | "expired";

/**
 * 单个 sandbox session 快照。
 */
export interface SandboxSessionSnapshot {
  /**
   * sandbox 唯一标识。
   */
  sandboxId: string;

  /**
   * 原始命令文本。
   */
  cmd: string;

  /**
   * 当前 sandbox 实际工作目录。
   */
  cwd: string;

  /**
   * 当前 sandbox 状态。
   */
  status: SandboxSessionStatus;

  /**
   * 进程 pid。
   *
   * 说明（中文）
   * - 某些 backend 可能拿不到宿主 pid，这时为空。
   */
  pid?: number;

  /**
   * 创建时间戳（毫秒）。
   */
  startedAt: number;

  /**
   * 最近更新时间戳（毫秒）。
   */
  updatedAt: number;

  /**
   * 结束时间戳（毫秒）。
   */
  endedAt?: number;

  /**
   * 退出码。
   */
  exitCode?: number;

  /**
   * 最近输出预览。
   */
  lastOutputPreview?: string;

  /**
   * 累计输出字符数。
   */
  outputChars: number;

  /**
   * 版本号。
   *
   * 说明（中文）
   * - 任意状态或输出变化都递增，供 wait/read 增量判断使用。
   */
  version: number;
}

/**
 * sandbox 输出块。
 */
export interface SandboxOutputChunk {
  /**
   * 当前输出块所属 sandbox 标识。
   */
  sandboxId: string;

  /**
   * 输出文本。
   */
  output: string;

  /**
   * 起始游标。
   */
  startCursor: number;

  /**
   * 结束游标。
   */
  endCursor: number;

  /**
   * 原始输出字符数。
   */
  originalChars: number;

  /**
   * 是否还有更多输出未读。
   */
  hasMoreOutput: boolean;
}

/**
 * one-shot 命令执行请求。
 */
export interface SandboxExecRequest {
  /**
   * 最终使用的 sandbox 配置。
   */
  config: SandboxConfig;

  /**
   * 要执行的命令文本。
   */
  cmd: string;

  /**
   * 可选工作目录。
   */
  cwd?: string;

  /**
   * 可选 shell 可执行文件。
   */
  shell?: string;

  /**
   * 是否以 login shell 语义执行。
   */
  login?: boolean;
}

/**
 * 状态化 sandbox session 启动请求。
 */
export interface SandboxStartRequest extends SandboxExecRequest {}

/**
 * sandbox 会话读取请求。
 */
export interface SandboxReadRequest {
  /**
   * 目标 sandbox 标识。
   */
  sandboxId: string;

  /**
   * 从哪个游标开始增量读取。
   */
  fromCursor?: number;
}

/**
 * sandbox 会话写入请求。
 */
export interface SandboxWriteRequest {
  /**
   * 目标 sandbox 标识。
   */
  sandboxId: string;

  /**
   * 要写入 stdin 的原始文本。
   */
  chars: string;
}

/**
 * sandbox 会话等待请求。
 */
export interface SandboxWaitRequest {
  /**
   * 目标 sandbox 标识。
   */
  sandboxId: string;

  /**
   * 仅当版本号大于该值时才立即返回。
   */
  afterVersion?: number;

  /**
   * 最长等待毫秒数。
   */
  timeoutMs?: number;
}

/**
 * sandbox 会话关闭请求。
 */
export interface SandboxCloseRequest {
  /**
   * 目标 sandbox 标识。
   */
  sandboxId: string;

  /**
   * 是否强制关闭。
   */
  force?: boolean;
}

/**
 * `SandboxRunner` 最小接口。
 *
 * 说明（中文）
 * - `exec` 用于 one-shot 命令。
 * - `start/read/write/wait/close` 用于状态化 shell session。
 */
export interface SandboxRunner {
  /**
   * 执行一次 one-shot 命令并等待完成。
   */
  exec(request: SandboxExecRequest): Promise<{
    snapshot: SandboxSessionSnapshot;
    chunk: SandboxOutputChunk;
  }>;

  /**
   * 启动一个状态化 sandbox session。
   */
  start(request: SandboxStartRequest): Promise<{
    snapshot: SandboxSessionSnapshot;
    chunk: SandboxOutputChunk;
  }>;

  /**
   * 读取 sandbox 输出。
   */
  read(request: SandboxReadRequest): Promise<{
    snapshot: SandboxSessionSnapshot;
    chunk: SandboxOutputChunk;
  }>;

  /**
   * 向 sandbox stdin 写入内容。
   */
  write(request: SandboxWriteRequest): Promise<{
    snapshot: SandboxSessionSnapshot;
  }>;

  /**
   * 等待 sandbox 状态变化。
   */
  wait(request: SandboxWaitRequest): Promise<{
    snapshot: SandboxSessionSnapshot;
    chunk: SandboxOutputChunk;
  }>;

  /**
   * 关闭 sandbox session。
   */
  close(request: SandboxCloseRequest): Promise<{
    snapshot: SandboxSessionSnapshot;
  }>;
}

/**
 * 运行时归一化后的 sandbox 配置。
 *
 * 说明（中文）
 * - 这里的路径都已经解析成绝对路径。
 * - 当前版本强制要求 shell 命令走 sandbox，不再允许回退到宿主机普通子进程执行。
 */
export interface ResolvedSandboxConfig extends SandboxConfig {
  /**
   * 当前运行时选中的 backend。
   */
  backend: SandboxBackend;

  /**
   * 当前 Downcity sandbox 模式。
   */
  sandboxMode?: "safe" | "unrestricted";

  /**
   * 当前 agent 级 sandbox 的持久目录。
   *
   * 说明（中文）
   * - 该目录不属于某个 shellId，而属于当前 agent 项目。
   * - shell、task script 等所有 sandbox 子进程共享它作为 HOME/cache 根。
   */
  sandboxDir: string;

  /**
   * sandbox 子进程使用的 HOME。
   */
  homeDir: string;

  /**
   * sandbox 子进程使用的临时目录。
   */
  tmpDir: string;

  /**
   * sandbox 子进程使用的 XDG cache 目录。
   */
  cacheDir: string;
}

/**
 * 单次 shell 启动时传给 sandbox backend 的归一化参数。
 */
export interface SandboxSpawnParams {
  /**
   * 当前执行记录标识。
   *
   * 说明（中文）
   * - shell runtime 传入 shellId，task script 可以传入自己的 executionId。
   * - 它只用于日志与诊断，不参与 sandbox HOME/cache/权限边界的计算。
   */
  executionId: string;

  /**
   * 当前执行记录目录。
   */
  executionDir: string;

  /**
   * 要执行的原始命令文本。
   */
  cmd: string;

  /**
   * 最终工作目录。
   */
  cwd: string;

  /**
   * shell 可执行文件路径。
   */
  shellPath: string;

  /**
   * 是否使用 login shell 语义。
   */
  login: boolean;

  /**
   * sandbox 生效前的基础环境变量。
   */
  baseEnv: NodeJS.ProcessEnv;

  /**
   * 是否使用伪终端启动进程。
   *
   * 说明（中文）
   * - 交互式 shell session 需要 PTY，才能让 REPL/TUI/行编辑类程序识别自己运行在终端中。
   * - 一次性命令默认不使用 PTY，保持 stdout/stderr 管道语义更稳定。
   */
  terminal?: boolean;

  /**
   * PTY 列数；仅 `terminal=true` 时生效。
   */
  cols?: number;

  /**
   * PTY 行数；仅 `terminal=true` 时生效。
   */
  rows?: number;

  /**
   * 当前请求最终使用的 sandbox 配置。
   */
  config: ResolvedSandboxConfig;
}

/**
 * shell 进程句柄。
 *
 * 关键点（中文）
 * - pipe 子进程与 PTY 子进程的 API 不同，这里收敛成 shell runtime 需要的最小协议。
 * - PTY 输出天然是 stdout/stderr 合流；pipe 子进程在 wrapper 中同样合并成单一输出流。
 */
export interface ShellProcessHandle {
  /**
   * 当前进程 pid；某些 backend 无法提供时为空。
   */
  pid?: number;

  /**
   * 当前进程是否仍允许写入输入。
   */
  writable: boolean;

  /**
   * 注册输出监听器。
   */
  onData(callback: (chunk: string | Buffer) => void): void;

  /**
   * 注册退出监听器。
   */
  onExit(callback: (exitCode: number) => void): void;

  /**
   * 注册启动错误监听器。
   */
  onError(callback: (error: Error) => void): void;

  /**
   * 写入 stdin / PTY 输入。
   */
  write(chars: string): Promise<void>;

  /**
   * 关闭进程。
   */
  kill(signal?: NodeJS.Signals): void;
}

/**
 * sandbox backend 返回的进程启动结果。
 */
export interface SandboxSpawnResult {
  /**
   * 已启动的子进程句柄。
   */
  child: ShellProcessHandle;

  /**
   * 当前子进程实际使用的工作目录。
   */
  cwd: string;

  /**
   * 当前进程是否实际运行在 sandbox 中。
   */
  sandboxed: boolean;

  /**
   * 当前 Downcity sandbox 模式。
   */
  sandboxMode?: "safe" | "unrestricted";

  /**
   * 当前使用的 backend 名称。
   */
  backend: SandboxBackend;

  /**
   * 当前实际采用的网络模式。
   */
  networkMode: SandboxNetworkMode;

  /**
   * 当前 agent 级 sandbox 的持久目录。
   */
  sandboxDir: string;

  /**
   * 当前子进程使用的 HOME。
   */
  homeDir: string;

  /**
   * 当前子进程使用的临时目录。
   */
  tmpDir: string;

  /**
   * 当前子进程使用的 XDG cache 目录。
   */
  cacheDir: string;
}
