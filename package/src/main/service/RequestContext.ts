import { AsyncLocalStorage } from "node:async_hooks";

/**
 * RequestContext（单次请求上下文）。
 *
 * 关键点（中文）
 * - 这是进程编排层的请求作用域上下文，不属于 core 内核。
 * - 统一承载请求链需要透传的上下文字段（如 `contextId/requestId`）。
 */
export type RequestContext = {
  contextId?: string;
  requestId?: string;
};

/**
 * AsyncLocalStorage 容器（请求作用域）。
 *
 * 关键点（中文）
 * - 同一条异步调用链内可读取到一致的 `ContextRequestContext`。
 * - 用于把 `contextId/requestId` 从入口透传到服务层与工具层。
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * 在当前异步调用链内绑定 context 请求上下文。
 *
 * 使用约束（中文）
 * - 仅对 `fn` 执行期间及其派生异步任务生效。
 * - 退出 `fn` 后自动恢复上层上下文。
 */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}

/**
 * 读取当前异步链路上的请求上下文。
 *
 * 关键点（中文）
 * - 返回 `undefined` 表示当前不在请求作用域中。
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
