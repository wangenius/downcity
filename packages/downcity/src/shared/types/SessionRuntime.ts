/**
 * Session runtime 抽象类型。
 *
 * 关键点（中文）
 * - 统一表达“某个 session 的实际执行器”。
 * - 允许同一套 SessionStore 同时承载 AI SDK runtime 与 ACP runtime。
 */

import type { SessionRunInput, SessionRunResult } from "@/shared/types/SessionRun.js";

/**
 * 单个 session runtime 实例接口。
 */
export interface SessionRuntimeLike {
  /**
   * 执行一次 session run。
   */
  run(input: SessionRunInput): Promise<SessionRunResult>;

  /**
   * 请求取消当前正在执行的 turn。
   *
   * 关键点（中文）
   * - 主要给 ACP runtime 使用，对应协议侧 `session/cancel`。
   * - 返回 `true` 表示本次请求已发出；`false` 表示当前没有可取消的 turn。
   */
  requestCancelCurrentTurn?(): Promise<boolean> | boolean;

  /**
   * 释放 runtime 持有的资源。
   *
   * 说明（中文）
   * - ACP runtime 可能持有子进程或 socket。
   * - 普通内存 runtime 可不实现。
   */
  dispose?(): Promise<void> | void;
}
