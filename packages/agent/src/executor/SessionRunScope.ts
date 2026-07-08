import { AsyncLocalStorage } from "node:async_hooks";
import type { FileUIPart } from "ai";
import type { SessionUserMessageV1 } from "@/executor/types/SessionRecords.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";

/**
 * SessionRunScope（单次请求作用域）。
 *
 * 关键点（中文）
 * - 这是 session run 层请求作用域上下文，不属于具体 plugin 业务模块。
 * - 当前阶段仅作为深层工具回调读取 `runContext` 的薄包装。
 */
export type SessionRunScope = {
  /**
   * 当前显式运行上下文。
   */
  runContext: SessionRunContext;
};

/**
 * AsyncLocalStorage 容器（请求作用域）。
 *
 * 关键点（中文）
 * - 同一条异步调用链内可读取一致的 SessionRunScope。
 * - 当前主要用于 tool 深层桥接层读取活跃 runContext。
 */
export const sessionRunScopeStorage = new AsyncLocalStorage<SessionRunScope>();

/**
 * 在当前异步调用链内绑定 session run 作用域。
 */
export function withSessionRunScope<T>(ctx: SessionRunScope, fn: () => T): T {
  return sessionRunScopeStorage.run(ctx, fn);
}

/**
 * 读取当前异步链路上的 session run 作用域。
 */
export function getSessionRunScope(): SessionRunScope | undefined {
  return sessionRunScopeStorage.getStore();
}

/**
 * 读取当前异步链路上的显式 runContext。
 */
export function getSessionRunContext(): SessionRunContext | undefined {
  return sessionRunScopeStorage.getStore()?.runContext;
}

/**
 * 入队一条“待注入 user 消息”。
 *
 * 关键点（中文）
 * - 若当前不在 session run 作用域内，静默忽略（fail-open）。
 */
export function enqueueInjectedUserMessage(
  message: SessionUserMessageV1,
): void {
  const run_context = getSessionRunContext();
  if (!run_context || !message) return;
  run_context.injectedUserMessages.push(message);
}

/**
 * 读取并清空“待注入 user 消息”队列。
 *
 * 关键点（中文）
 * - 采用 drain 语义，确保每条注入消息只在下一 step 使用一次。
 */
export function drainInjectedUserMessages(): SessionUserMessageV1[] {
  const run_context = getSessionRunContext();
  if (!run_context) return [];
  const out = [...run_context.injectedUserMessages];
  run_context.injectedUserMessages = [];
  return out;
}

/**
 * 入队一条“待持久化 user 消息”。
 */
export function enqueueDeferredPersistedUserMessage(
  sessionId: string,
  message: SessionUserMessageV1,
): void {
  const run_context = getSessionRunContext();
  const key = String(sessionId || "").trim();
  if (!run_context || !key || !message) return;
  if (run_context.sessionId !== key) return;
  run_context.deferredPersistedUserMessages.push(message);
}

/**
 * 读取并清空指定 session 的待持久化 user 消息。
 */
export function drainDeferredPersistedUserMessages(
  sessionId: string,
): SessionUserMessageV1[] {
  const run_context = getSessionRunContext();
  const key = String(sessionId || "").trim();
  if (!run_context || !key || run_context.sessionId !== key) return [];
  const current = [...run_context.deferredPersistedUserMessages];
  run_context.deferredPersistedUserMessages = [];
  return current;
}

/**
 * 入队一组“待并入 assistant 消息的 file parts”。
 */
export function enqueueAssistantFileParts(parts: FileUIPart[]): void {
  const run_context = getSessionRunContext();
  if (!run_context || !Array.isArray(parts) || parts.length === 0) return;
  run_context.pendingAssistantFileParts.push(...parts);
}

/**
 * 读取当前 run 内待并入 assistant 消息的 file parts。
 */
export function readPendingAssistantFileParts(): FileUIPart[] {
  const run_context = getSessionRunContext();
  if (!run_context) return [];
  return [...run_context.pendingAssistantFileParts];
}
