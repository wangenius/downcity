import { AsyncLocalStorage } from "node:async_hooks";

/**
 * RequestContext（单次请求上下文）。
 *
 * 关键点（中文）
 * - 这是 runtime 层请求作用域上下文，不属于具体 service 模块。
 * - 统一承载请求链需要透传的字段（如 `contextId/requestId`）。
 */
export type RequestContext = {
  contextId?: string;
  requestId?: string;
};

/**
 * AsyncLocalStorage 容器（请求作用域）。
 *
 * 关键点（中文）
 * - 同一条异步调用链内可读取一致的 RequestContext。
 * - 用于把 `contextId/requestId` 从入口透传到 service 与工具层。
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * 在当前异步调用链内绑定请求上下文。
 */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}

/**
 * 读取当前异步链路上的请求上下文。
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
