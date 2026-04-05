/**
 * SessionExecutor 抽象类型。
 *
 * 关键点（中文）
 * - 统一表达“某个 session 的实际执行器”。
 * - 允许同一套 Session 实例同时承载本地执行与 ACP 执行两种模式。
 */

import type { SessionRunInput, SessionRunResult } from "@/types/session/SessionRun.js";

/**
 * 单个 session 执行器接口。
 */
export interface SessionExecutor {
  /**
   * 执行一次 session run。
   */
  run(input: SessionRunInput): Promise<SessionRunResult>;

  /**
   * 请求取消当前正在执行的 turn。
   *
   * 关键点（中文）
   * - 主要给 ACP 执行器使用，对应协议侧 `session/cancel`。
   * - 返回 `true` 表示本次请求已发出；`false` 表示当前没有可取消的 turn。
   */
  requestCancelCurrentTurn?(): Promise<boolean> | boolean;

  /**
   * 释放执行器持有的资源。
   *
   * 说明（中文）
   * - ACP 执行器可能持有子进程或 socket。
   * - 普通内存执行器可不实现。
   */
  dispose?(): Promise<void> | void;
}
