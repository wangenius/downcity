/**
 * Shell session 运行时辅助能力。
 *
 * 关键点（中文）
 * - 统一承载 SessionStore 的内部共享逻辑：环境组装、持久化、waiter 协调、session 查找。
 * - 对外暴露给 SessionStore 的只有纯运行时辅助函数，不直接承担 service action 编排。
 */

import path from "node:path";
import fs from "fs-extra";
import { INTERNAL_RUNTIME_AUTH_ENV_KEY } from "@/main/auth/InternalRuntimeAuth.js";
import { loadGlobalEnvFromStore } from "@/main/env/Config.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type {
  SessionWaiter,
  ShellServiceState,
  ShellSessionRuntime,
} from "@/types/ShellRuntime.js";
import { requestContext } from "@sessions/RequestContext.js";
import { resolveChatQueueStore } from "@services/chat/runtime/ChatQueue.js";
import { appendExecSessionMessage } from "@services/chat/runtime/ChatIngressStore.js";
import { readChatMetaBySessionId } from "@services/chat/runtime/ChatMetaStore.js";
import type {
  ShellActionResponse,
  ShellOutputChunk,
  ShellQueryRequest,
  ShellSessionSnapshot,
  ShellSessionStatus,
} from "@services/shell/types/ShellService.js";
import { getShellOutputPath, getShellSnapshotPath } from "./Paths.js";

const MAX_ACTIVE_SHELLS = 64;
const SESSION_CLEANUP_DELAY_MS = 10 * 60 * 1000;
const MAX_IN_MEMORY_OUTPUT_CHARS = 1_000_000;
const MIN_WAIT_MS = 50;
const MAX_WAIT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_CHARS = 12_000;
const DEFAULT_MAX_OUTPUT_LINES = 200;
const APPROX_CHARS_PER_TOKEN = 4;
const OUTPUT_PREVIEW_CHARS = 280;

/**
 * shell.start 默认内联等待时间。
 */
export const DEFAULT_INLINE_WAIT_MS = 1_200;

/**
 * shell.wait 默认等待超时。
 */
export const DEFAULT_WAIT_TIMEOUT_MS = 10_000;

/**
 * shell.exec 默认总超时。
 */
export const DEFAULT_EXEC_TIMEOUT_MS = 60_000;

/**
 * 创建 shell service 初始状态。
 */
export function createShellServiceState(): ShellServiceState {
  return {
    sessions: new Map<string, ShellSessionRuntime>(),
    boundRuntime: null,
  };
}

/**
 * 返回当前毫秒时间戳。
 */
export function nowMs(): number {
  return Date.now();
}

/**
 * 归一化 wait/timeout 参数。
 */
export function clampWaitMs(value: number | undefined, fallback: number): number {
  const raw =
    typeof value === "number" && Number.isFinite(value)
      ? Math.floor(value)
      : fallback;
  return Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, raw));
}

function normalizeOutputChunk(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function resolveOutputLimits(params: {
  context: ExecutionContext;
  maxOutputTokens?: number;
}): {
  maxChars: number;
  maxLines: number;
} {
  const byTokens =
    typeof params.maxOutputTokens === "number" &&
    Number.isFinite(params.maxOutputTokens) &&
    params.maxOutputTokens > 0
      ? Math.max(200, Math.floor(params.maxOutputTokens * APPROX_CHARS_PER_TOKEN))
      : null;
  return {
    maxChars:
      byTokens == null
        ? DEFAULT_MAX_OUTPUT_CHARS
        : Math.min(DEFAULT_MAX_OUTPUT_CHARS, byTokens),
    maxLines: DEFAULT_MAX_OUTPUT_LINES,
  };
}

function splitOutputByLimits(
  text: string,
  maxChars: number,
  maxLines: number,
): { head: string; tail: string } {
  const limitedByChars = text.slice(0, Math.min(text.length, maxChars));
  let head = limitedByChars;
  if (maxLines > 0) {
    const lines = limitedByChars.split("\n");
    if (lines.length > maxLines) {
      head = lines.slice(0, maxLines).join("\n");
    }
  }
  return {
    head,
    tail: text.slice(head.length),
  };
}

/**
 * 构造 shell 子进程环境变量。
 */
export function buildShellEnv(context: ExecutionContext): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // 关键点（中文）
  // - shell 子进程需要继承 console 级 global env。
  // - 这里显式从 store 读取，避免把 ExecutionContext.env 语义扩大成“全局+agent 混合态”。
  // - 冲突时仍由后续 agent 私有 env 覆盖，保持文档声明的优先级。
  const globalEnv = loadGlobalEnvFromStore();
  for (const [key, value] of Object.entries(globalEnv)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    env[normalizedKey] = normalizedValue;
  }

  for (const [key, value] of Object.entries(context.env || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    env[normalizedKey] = normalizedValue;
  }

  const request = requestContext.getStore();
  const sessionId = String(request?.sessionId || "").trim();
  const requestId = String(request?.requestId || "").trim();
  if (sessionId) env.DC_SESSION_ID = sessionId;
  if (requestId) env.DC_CTX_REQUEST_ID = requestId;
  if (process.env.DC_SERVER_HOST) env.DC_CTX_SERVER_HOST = process.env.DC_SERVER_HOST;
  if (process.env.DC_SERVER_PORT) env.DC_CTX_SERVER_PORT = process.env.DC_SERVER_PORT;
  if (!env.DC_AUTH_TOKEN && process.env[INTERNAL_RUNTIME_AUTH_ENV_KEY]) {
    env.DC_AUTH_TOKEN = String(process.env[INTERNAL_RUNTIME_AUTH_ENV_KEY] || "").trim();
  }
  return env;
}

/**
 * 解析 shell 执行目录。
 */
export function resolveShellCwd(context: ExecutionContext, cwd?: string): string {
  const raw = String(cwd || "").trim();
  if (!raw) return context.rootPath;
  return path.isAbsolute(raw) ? raw : path.resolve(context.rootPath, raw);
}

/**
 * 推断 shell 所属的 owner context。
 */
export function resolveOwnerContextId(explicit?: string): string | undefined {
  const fromInput = String(explicit || "").trim();
  if (fromInput) return fromInput;
  const fromRequest = String(requestContext.getStore()?.sessionId || "").trim();
  return fromRequest || undefined;
}

/**
 * 推断 shell 所属的 request id。
 */
export function resolveOwnerRequestId(): string | undefined {
  const requestId = String(requestContext.getStore()?.requestId || "").trim();
  return requestId || undefined;
}

function deriveExitStatus(exitCode: number | undefined): ShellSessionStatus {
  if (exitCode === -9 || exitCode === 137) return "killed";
  if (typeof exitCode === "number" && exitCode === 0) return "completed";
  return "failed";
}

/**
 * 判断 shell 是否已进入终态。
 */
export function isTerminalStatus(status: ShellSessionStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "killed" ||
    status === "expired"
  );
}

function extractExternalRefsFromText(
  text: string,
  current: ShellSessionSnapshot["externalRefs"],
): ShellSessionSnapshot["externalRefs"] {
  const next = [...current];
  const register = (kind: string, value: string, label?: string): void => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    if (next.some((item) => item.kind === kind && item.value === normalized)) return;
    next.push({ kind, value: normalized, ...(label ? { label } : {}) });
  };

  const threadIdRegex = /thread_id[:=]\s*([a-zA-Z0-9_-]{6,})/g;
  for (const match of text.matchAll(threadIdRegex)) {
    register("thread_id", String(match[1] || ""), "external thread id");
  }
  return next;
}

/**
 * 持久化 shell snapshot。
 */
export async function persistSnapshot(session: ShellSessionRuntime): Promise<void> {
  await fs.ensureDir(path.dirname(session.snapshotFilePath));
  await fs.writeJson(session.snapshotFilePath, session.snapshot, { spaces: 2 });
}

function enqueuePersistedAppend(
  session: ShellSessionRuntime,
  text: string,
): Promise<void> {
  session.writeChain = session.writeChain.then(async () => {
    await fs.ensureDir(path.dirname(session.outputFilePath));
    await fs.appendFile(session.outputFilePath, text, "utf-8");
  });
  return session.writeChain;
}

function notifyWaiters(session: ShellSessionRuntime): void {
  for (const waiter of Array.from(session.waiters)) {
    clearTimeout(waiter.timer);
    session.waiters.delete(waiter);
    waiter.resolve();
  }
}

async function emitChatCompletionEvent(
  context: ExecutionContext,
  snapshot: ShellSessionSnapshot,
): Promise<void> {
  const ownerContextId = String(snapshot.ownerContextId || "").trim();
  if (!ownerContextId || snapshot.notificationSent !== false) return;

  const meta = await readChatMetaBySessionId({
    context,
    sessionId: ownerContextId,
  });
  if (!meta) return;

  const lines = [
    "[内部 shell 状态通知]",
    `shell_id: ${snapshot.shellId}`,
    `status: ${snapshot.status}`,
    `exit_code: ${typeof snapshot.exitCode === "number" ? snapshot.exitCode : "null"}`,
    `cmd: ${snapshot.cmd}`,
  ];
  if (snapshot.lastOutputPreview) {
    lines.push(`last_output_preview: ${snapshot.lastOutputPreview}`);
  }
  if (snapshot.externalRefs.length > 0) {
    const refs = snapshot.externalRefs.map((item) => `${item.kind}=${item.value}`);
    lines.push(`external_refs: ${refs.join(", ")}`);
  }
  lines.push("请根据当前 shell 的状态，主动向用户简洁汇报结果或最新进展。");
  const text = lines.join("\n");

  await appendExecSessionMessage({
    context,
    sessionId: ownerContextId,
    text,
    extra: {
      note: "shell_session_auto_notify",
      internal: true,
      shellId: snapshot.shellId,
      shellStatus: snapshot.status,
      exitCode:
        typeof snapshot.exitCode === "number" ? snapshot.exitCode : null,
    },
  });

  resolveChatQueueStore(context).enqueue({
    kind: "exec",
    channel: meta.channel,
    targetId: meta.chatId,
    sessionId: ownerContextId,
    text,
    ...(meta.targetType ? { targetType: meta.targetType } : {}),
    ...(typeof meta.threadId === "number" ? { threadId: meta.threadId } : {}),
    ...(meta.messageId ? { messageId: meta.messageId } : {}),
    ...(meta.actorId ? { actorId: meta.actorId } : {}),
    ...(meta.actorName ? { actorName: meta.actorName } : {}),
    sessionPersisted: true,
    extra: {
      note: "shell_session_auto_notify",
      internal: true,
      shellId: snapshot.shellId,
      shellStatus: snapshot.status,
      exitCode:
        typeof snapshot.exitCode === "number" ? snapshot.exitCode : null,
    },
  });
}

/**
 * 更新 session snapshot 并唤醒等待者。
 */
export async function updateSessionSnapshot(
  session: ShellSessionRuntime,
  updater: (snapshot: ShellSessionSnapshot) => void | ShellSessionSnapshot,
): Promise<void> {
  const result = updater(session.snapshot);
  if (result) {
    session.snapshot = result;
  }
  session.snapshot.updatedAt = nowMs();
  session.snapshot.version += 1;
  await persistSnapshot(session);
  notifyWaiters(session);
}

/**
 * 追加 shell 输出并同步更新快照。
 */
export async function appendSessionOutput(
  session: ShellSessionRuntime,
  raw: string,
): Promise<void> {
  const text = normalizeOutputChunk(raw);
  if (!text) return;

  session.outputText += text;
  if (session.outputText.length > MAX_IN_MEMORY_OUTPUT_CHARS) {
    const overflow = session.outputText.length - MAX_IN_MEMORY_OUTPUT_CHARS;
    session.outputText = session.outputText.slice(overflow);
    session.snapshot.droppedChars += overflow;
  }

  session.snapshot.outputChars += text.length;
  session.snapshot.lastOutputAt = nowMs();
  session.snapshot.lastOutputPreview = session.outputText
    .slice(-OUTPUT_PREVIEW_CHARS)
    .trim();
  session.snapshot.externalRefs = extractExternalRefsFromText(
    text,
    session.snapshot.externalRefs,
  );
  await enqueuePersistedAppend(session, text);
  await updateSessionSnapshot(session, () => undefined);
}

/**
 * 为终态 shell 安排延迟清理。
 */
export function scheduleCleanup(state: ShellServiceState, shellId: string): void {
  const session = state.sessions.get(shellId);
  if (!session) return;
  if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
  session.cleanupTimer = setTimeout(() => {
    const current = state.sessions.get(shellId);
    if (!current) return;
    state.sessions.delete(shellId);
  }, SESSION_CLEANUP_DELAY_MS);
  if (typeof session.cleanupTimer.unref === "function") {
    session.cleanupTimer.unref();
  }
}

/**
 * 控制 in-memory shell session 容量。
 */
export function ensureCapacity(state: ShellServiceState): void {
  if (state.sessions.size < MAX_ACTIVE_SHELLS) return;
  const removable = Array.from(state.sessions.values())
    .filter((item) => item.snapshot.status !== "running" && item.snapshot.status !== "starting")
    .sort((a, b) => a.snapshot.updatedAt - b.snapshot.updatedAt);
  for (const item of removable) {
    if (state.sessions.size < MAX_ACTIVE_SHELLS) break;
    state.sessions.delete(item.snapshot.shellId);
  }
  if (state.sessions.size >= MAX_ACTIVE_SHELLS) {
    throw new Error(
      `Too many active shell sessions (${state.sessions.size}). Please close or wait older sessions first.`,
    );
  }
}

async function loadPersistedSnapshot(
  context: ExecutionContext,
  shellId: string,
): Promise<ShellSessionSnapshot | null> {
  const file = getShellSnapshotPath(context.rootPath, shellId);
  if (!(await fs.pathExists(file))) return null;
  const raw = await fs.readJson(file).catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const snapshot = raw as ShellSessionSnapshot;
  return typeof snapshot.shellId === "string" ? snapshot : null;
}

async function readPersistedOutput(
  context: ExecutionContext,
  shellId: string,
): Promise<string> {
  const file = getShellOutputPath(context.rootPath, shellId);
  if (!(await fs.pathExists(file))) return "";
  return await fs.readFile(file, "utf-8");
}

/**
 * 按 shellId 或 ownerContext 解析目标 session。
 */
export async function resolveSession(
  state: ShellServiceState,
  context: ExecutionContext,
  query: ShellQueryRequest,
): Promise<ShellSessionRuntime | { snapshot: ShellSessionSnapshot; outputText: string } | null> {
  const explicitShellId = String(query.shellId || "").trim();
  if (explicitShellId) {
    const inMemory = state.sessions.get(explicitShellId);
    if (inMemory) return inMemory;
    const snapshot = await loadPersistedSnapshot(context, explicitShellId);
    if (!snapshot) return null;
    return {
      snapshot,
      outputText: await readPersistedOutput(context, explicitShellId),
    };
  }

  const ownerContextId = resolveOwnerContextId(query.ownerContextId);
  const cmd = String(query.cmd || "").trim().toLowerCase();
  if (!ownerContextId) return null;
  const includeCompleted = query.includeCompleted === true;
  const matched = Array.from(state.sessions.values())
    .filter((item) => {
      if (item.snapshot.ownerContextId !== ownerContextId) return false;
      if (!includeCompleted) {
        if (
          item.snapshot.status !== "running" &&
          item.snapshot.status !== "starting"
        ) {
          return false;
        }
      }
      if (!cmd) return true;
      return item.snapshot.cmd.toLowerCase().includes(cmd);
    })
    .sort((a, b) => b.snapshot.updatedAt - a.snapshot.updatedAt);
  return matched[0] || null;
}

/**
 * 根据游标与 token 限制构造输出块。
 */
export function createOutputChunk(params: {
  shellId: string;
  outputText: string;
  fromCursor?: number;
  context: ExecutionContext;
  maxOutputTokens?: number;
}): ShellOutputChunk {
  const fromCursor =
    typeof params.fromCursor === "number" && params.fromCursor >= 0
      ? Math.floor(params.fromCursor)
      : 0;
  const available = params.outputText.slice(fromCursor);
  const originalChars = available.length;
  const originalLines = available ? available.split("\n").length : 0;
  const limits = resolveOutputLimits({
    context: params.context,
    maxOutputTokens: params.maxOutputTokens,
  });
  const { head, tail } = splitOutputByLimits(
    available,
    limits.maxChars,
    limits.maxLines,
  );
  return {
    shellId: params.shellId,
    output: head,
    startCursor: fromCursor,
    endCursor: fromCursor + head.length,
    originalChars,
    originalLines,
    hasMoreOutput: tail.length > 0,
  };
}

/**
 * 构造 shell action 标准返回。
 */
export function buildActionResponse(params: {
  shell: ShellSessionSnapshot;
  chunk?: ShellOutputChunk;
  note?: string;
}): ShellActionResponse {
  return {
    shell: params.shell,
    ...(params.chunk ? { chunk: params.chunk } : {}),
    ...(params.note ? { note: params.note } : {}),
  };
}

/**
 * 判断解析出的 session 是否仍在内存中活动。
 */
export function isInMemorySession(
  value: ShellSessionRuntime | { snapshot: ShellSessionSnapshot; outputText: string },
): value is ShellSessionRuntime {
  return "child" in value;
}

/**
 * 处理 shell 退出后的状态收口。
 */
export async function finalizeExit(
  state: ShellServiceState,
  session: ShellSessionRuntime,
  exitCode: number,
): Promise<void> {
  await updateSessionSnapshot(session, (snapshot) => {
    snapshot.status = deriveExitStatus(exitCode);
    snapshot.exitCode = exitCode;
    snapshot.endedAt = nowMs();
    snapshot.pid = session.child.pid ?? snapshot.pid;
  });
  session.resolveCompletion();
  scheduleCleanup(state, session.snapshot.shellId);

  if (
    session.snapshot.autoNotifyOnExit &&
    session.snapshot.notificationSent === false &&
    state.boundRuntime
  ) {
    await emitChatCompletionEvent(state.boundRuntime, session.snapshot);
    session.snapshot.notificationSent = true;
    await persistSnapshot(session);
  }
}
