import { AsyncLocalStorage } from "node:async_hooks";
import type { SessionUserMessageV1 } from "@agent/types/SessionMessage.js";
import type { AgentAssistantStepCallback } from "@agent/types/Agent.js";

/**
 * RequestContext（单次请求上下文）。
 *
 * 关键点（中文）
 * - 这是 runtime 层请求作用域上下文，不属于具体 service 模块。
 * - 统一承载请求链需要透传的字段（如 `sessionId/requestId`）。
 */
export type RequestContext = {
  sessionId?: string;
  requestId?: string;
  /**
   * step 边界合并回调（可选）。
   *
   * 关键点（中文）
   * - 由调用侧（如 chat queue）注入。
   * - Orchestrator 从 RequestContext 读取并编排到本轮运行上下文。
   */
  onStepCallback?: () => Promise<SessionUserMessageV1[]>;

  /**
   * assistant step 完成回调（可选）。
   *
   * 关键点（中文）
   * - 在每个 LLM step 结束时触发。
   * - 用于把中间文本增量派发到外部通道（如 direct 模式分步发送）。
   */
  onAssistantStepCallback?: AgentAssistantStepCallback;

  /**
   * 运行时注入的 user 消息队列（可选）。
   *
   * 关键点（中文）
   * - 用于在 tool 执行后向下一 step 注入结构化 user 消息。
   * - 队列内容由 service 侧通过统一协议下发，main 不感知业务语义。
   */
  injectedUserMessages?: SessionUserMessageV1[];
};

/**
 * AsyncLocalStorage 容器（请求作用域）。
 *
 * 关键点（中文）
 * - 同一条异步调用链内可读取一致的 RequestContext。
 * - 用于把 `sessionId/requestId` 从入口透传到 service 与工具层。
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * 待持久化的运行时注入 user 消息队列（按 sessionId）。
 *
 * 关键点（中文）
 * - requestContext 中的 injectedUserMessages 只负责“下一 step 临时可见”。
 * - 为了让时间线顺序稳定，这里把“真正写入历史”的动作延后到
 *   assistant message 落盘之后再统一执行。
 */
const deferredPersistedUserMessagesBySession = new Map<
  string,
  SessionUserMessageV1[]
>();

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

/**
 * 入队一条“待注入 user 消息”。
 *
 * 关键点（中文）
 * - 若当前不在请求上下文内，静默忽略（fail-open）。
 */
export function enqueueInjectedUserMessage(
  message: SessionUserMessageV1,
): void {
  const store = requestContext.getStore();
  if (!store || !message) return;
  if (!Array.isArray(store.injectedUserMessages)) {
    store.injectedUserMessages = [];
  }
  store.injectedUserMessages.push(message);
}

/**
 * 读取并清空“待注入 user 消息”队列。
 *
 * 关键点（中文）
 * - 采用 drain 语义，确保每条注入消息只在下一 step 使用一次。
 */
export function drainInjectedUserMessages(): SessionUserMessageV1[] {
  const store = requestContext.getStore();
  if (!store || !Array.isArray(store.injectedUserMessages)) return [];
  const out = [...store.injectedUserMessages];
  store.injectedUserMessages = [];
  return out;
}

/**
 * 入队一条“待持久化 user 消息”。
 */
export function enqueueDeferredPersistedUserMessage(
  sessionId: string,
  message: SessionUserMessageV1,
): void {
  const key = String(sessionId || "").trim();
  if (!key || !message) return;
  const current = deferredPersistedUserMessagesBySession.get(key) || [];
  current.push(message);
  deferredPersistedUserMessagesBySession.set(key, current);
}

/**
 * 读取并清空指定 session 的待持久化 user 消息。
 */
export function drainDeferredPersistedUserMessages(
  sessionId: string,
): SessionUserMessageV1[] {
  const key = String(sessionId || "").trim();
  if (!key) return [];
  const current = deferredPersistedUserMessagesBySession.get(key) || [];
  deferredPersistedUserMessagesBySession.delete(key);
  return [...current];
}
