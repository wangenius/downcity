import { AsyncLocalStorage } from "node:async_hooks";

/**
 * ContextRequestContext（单次请求上下文）。
 *
 * 关键点（中文）
 * - 这是进程编排层的请求作用域上下文，不属于 core 内核。
 * - 仅保留最小必要字段：`contextId`。
 */
export type ContextRequestContext = {
  contextId?: string;
};

/**
 * AsyncLocalStorage 容器（请求作用域）。
 *
 * 关键点（中文）
 * - 同一条异步调用链内可读取到一致的 `ContextRequestContext`。
 * - 用于把 `contextId` 从入口透传到服务层与工具层。
 */
export const contextRequestContext =
  new AsyncLocalStorage<ContextRequestContext>();

/**
 * 在当前异步调用链内绑定 context 请求上下文。
 *
 * 使用约束（中文）
 * - 仅对 `fn` 执行期间及其派生异步任务生效。
 * - 退出 `fn` 后自动恢复上层上下文。
 */
export function withContextRequestContext<T>(
  ctx: ContextRequestContext,
  fn: () => T,
): T {
  return contextRequestContext.run(ctx, fn);
}
