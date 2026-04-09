/**
 * SandboxRuntime 类型定义。
 *
 * 关键点（中文）
 * - 这里放的是 agent 执行层内部使用的最小 sandbox 运行时类型。
 * - 当前只围绕 `SandboxRunner` 设计，不引入复杂 provider / policy / binding 对象。
 * - 目标是让 `ShellService` 可以直接把命令交给 `SandboxRunner` 执行。
 */

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { SandboxConfig } from "@/shared/types/Sandbox.js";
import type { SandboxNetworkMode } from "@/shared/types/Sandbox.js";

/**
 * sandbox 会话状态。
 *
 * 说明（中文）
 * - `shell_exec` 这类 one-shot 命令通常会很快走到终态。
 * - `shell_start` 则会维持一个状态化 sandbox session。
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
  backend: "macos-seatbelt";
}

/**
 * 单次 shell 启动时传给 sandbox backend 的归一化参数。
 */
export interface SandboxSpawnParams {
  /**
   * 当前 shell 会话标识。
   */
  shellId: string;

  /**
   * shell 会话目录。
   */
  shellDir: string;

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
   * 当前请求最终使用的 sandbox 配置。
   */
  config: ResolvedSandboxConfig;
}

/**
 * sandbox backend 返回的进程启动结果。
 */
export interface SandboxSpawnResult {
  /**
   * 已启动的子进程句柄。
   */
  child: ChildProcessWithoutNullStreams;

  /**
   * 当前子进程实际使用的工作目录。
   */
  cwd: string;

  /**
   * 当前进程是否实际运行在 sandbox 中。
   */
  sandboxed: boolean;

  /**
   * 当前使用的 backend 名称。
   */
  backend: "macos-seatbelt";

  /**
   * 当前实际采用的网络模式。
   */
  networkMode: SandboxNetworkMode;
}
