/**
 * ShellRunScope：shell 工具调用的异步运行作用域。
 *
 * 关键点（中文）
 * - Shell 包不依赖 agent，但 shell approval event 需要知道当前 session / turn。
 * - 宿主在执行模型 run 时绑定该 scope，Shell tool 在深层回调里自动读取。
 * - 这让用户只需要 `new Agent({ shell: new Shell() })`，不需要理解 run context wiring。
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Shell 当前运行上下文。
 */
export interface ShellScopedRunContext {
  /**
   * 当前宿主 session id。
   */
  session_id?: string;

  /**
   * 当前宿主 turn id。
   */
  turn_id?: string;
}

/**
 * Shell run scope。
 */
export interface ShellRunScope {
  /**
   * 当前 shell tool 调用可读取的宿主运行上下文。
   */
  run_context: ShellScopedRunContext;
}

const shell_run_scope_storage = new AsyncLocalStorage<ShellRunScope>();

/**
 * 绑定当前异步链路上的 shell run scope。
 */
export function withShellRunScope<T>(scope: ShellRunScope, fn: () => T): T {
  return shell_run_scope_storage.run(scope, fn);
}

/**
 * 读取当前异步链路上的 shell run scope。
 */
export function getShellRunScope(): ShellRunScope | undefined {
  return shell_run_scope_storage.getStore();
}

/**
 * 读取当前异步链路上的 shell run context。
 */
export function getShellRunContext(): ShellScopedRunContext | undefined {
  return shell_run_scope_storage.getStore()?.run_context;
}
