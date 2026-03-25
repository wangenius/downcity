/**
 * Shell session 运行时存储。
 *
 * 关键点（中文）
 * - 负责 shell 子进程生命周期、输出收集、状态等待、落盘持久化。
 * - 该模块只处理“shell 会话”本身，不直接承担 agent/chat 业务语义。
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";
import { loadGlobalEnvFromStore } from "@/console/env/Config.js";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import { generateId } from "@utils/Id.js";
import { requestContext } from "@agent/context/manager/RequestContext.js";
import { enqueueChatQueue } from "@services/chat/runtime/ChatQueue.js";
import { appendExecContextMessage } from "@services/chat/runtime/ChatIngressStore.js";
import { readChatMetaByContextId } from "@services/chat/runtime/ChatMetaStore.js";
import type {
  ShellActionResponse,
  ShellCloseRequest,
  ShellExecRequest,
  ShellOutputChunk,
  ShellQueryRequest,
  ShellReadRequest,
  ShellSessionSnapshot,
  ShellSessionStatus,
  ShellStartRequest,
  ShellWaitRequest,
  ShellWriteRequest,
} from "@services/shell/types/ShellService.js";
import { getShellDir, getShellOutputPath, getShellSnapshotPath } from "./Paths.js";

const MAX_ACTIVE_SHELLS = 64;
const SESSION_CLEANUP_DELAY_MS = 10 * 60 * 1000;
const MAX_IN_MEMORY_OUTPUT_CHARS = 1_000_000;
const DEFAULT_INLINE_WAIT_MS = 1_200;
const DEFAULT_WAIT_TIMEOUT_MS = 10_000;
const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
const MIN_WAIT_MS = 50;
const MAX_WAIT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_CHARS = 12_000;
const DEFAULT_MAX_OUTPUT_LINES = 200;
const APPROX_CHARS_PER_TOKEN = 4;
const OUTPUT_PREVIEW_CHARS = 280;

type SessionWaiter = {
  resolve: () => void;
  timer: NodeJS.Timeout;
};

type ShellSessionRuntime = {
  snapshot: ShellSessionSnapshot;
  child: ChildProcessWithoutNullStreams;
  outputText: string;
  outputFilePath: string;
  snapshotFilePath: string;
  writeChain: Promise<void>;
  cleanupTimer: NodeJS.Timeout | null;
  waiters: Set<SessionWaiter>;
};

const sessions = new Map<string, ShellSessionRuntime>();
let boundRuntime: ServiceRuntime | null = null;

function nowMs(): number {
  return Date.now();
}

function clampWaitMs(value: number | undefined, fallback: number): number {
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
  runtime: ServiceRuntime;
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

function buildShellEnv(runtime: ServiceRuntime): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // 关键点（中文）
  // - shell 子进程需要继承 console 级 global env。
  // - 这里显式从 store 读取，避免把 ServiceRuntime.env 语义扩大成“全局+agent 混合态”。
  // - 冲突时仍由后续 agent runtime env 覆盖，保持文档声明的优先级。
  const globalEnv = loadGlobalEnvFromStore();
  for (const [key, value] of Object.entries(globalEnv)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    env[normalizedKey] = normalizedValue;
  }

  for (const [key, value] of Object.entries(runtime.env || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    env[normalizedKey] = normalizedValue;
  }

  const request = requestContext.getStore();
  const contextId = String(request?.contextId || "").trim();
  const requestId = String(request?.requestId || "").trim();
  if (contextId) env.DC_CTX_CONTEXT_ID = contextId;
  if (requestId) env.DC_CTX_REQUEST_ID = requestId;
  if (process.env.DC_SERVER_HOST) env.DC_CTX_SERVER_HOST = process.env.DC_SERVER_HOST;
  if (process.env.DC_SERVER_PORT) env.DC_CTX_SERVER_PORT = process.env.DC_SERVER_PORT;
  return env;
}

function resolveShellCwd(runtime: ServiceRuntime, cwd?: string): string {
  const raw = String(cwd || "").trim();
  if (!raw) return runtime.rootPath;
  return path.isAbsolute(raw) ? raw : path.resolve(runtime.rootPath, raw);
}

function resolveOwnerContextId(explicit?: string): string | undefined {
  const fromInput = String(explicit || "").trim();
  if (fromInput) return fromInput;
  const fromRequest = String(requestContext.getStore()?.contextId || "").trim();
  return fromRequest || undefined;
}

function resolveOwnerRequestId(): string | undefined {
  const requestId = String(requestContext.getStore()?.requestId || "").trim();
  return requestId || undefined;
}

function deriveExitStatus(exitCode: number | undefined): ShellSessionStatus {
  if (exitCode === -9 || exitCode === 137) return "killed";
  if (typeof exitCode === "number" && exitCode === 0) return "completed";
  return "failed";
}

function isTerminalStatus(status: ShellSessionStatus): boolean {
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

async function persistSnapshot(session: ShellSessionRuntime): Promise<void> {
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
  runtime: ServiceRuntime,
  snapshot: ShellSessionSnapshot,
): Promise<void> {
  const ownerContextId = String(snapshot.ownerContextId || "").trim();
  if (!ownerContextId || snapshot.notificationSent !== false) return;

  const meta = await readChatMetaByContextId({
    context: runtime,
    contextId: ownerContextId,
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

  await appendExecContextMessage({
    context: runtime,
    contextId: ownerContextId,
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

  enqueueChatQueue({
    kind: "exec",
    channel: meta.channel,
    targetId: meta.chatId,
    contextId: ownerContextId,
    text,
    ...(meta.targetType ? { targetType: meta.targetType } : {}),
    ...(typeof meta.threadId === "number" ? { threadId: meta.threadId } : {}),
    ...(meta.messageId ? { messageId: meta.messageId } : {}),
    ...(meta.actorId ? { actorId: meta.actorId } : {}),
    ...(meta.actorName ? { actorName: meta.actorName } : {}),
    contextPersisted: true,
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

async function updateSessionSnapshot(
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

async function appendSessionOutput(
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

function scheduleCleanup(shellId: string): void {
  const session = sessions.get(shellId);
  if (!session) return;
  if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
  session.cleanupTimer = setTimeout(() => {
    const current = sessions.get(shellId);
    if (!current) return;
    sessions.delete(shellId);
  }, SESSION_CLEANUP_DELAY_MS);
  if (typeof session.cleanupTimer.unref === "function") {
    session.cleanupTimer.unref();
  }
}

function ensureCapacity(): void {
  if (sessions.size < MAX_ACTIVE_SHELLS) return;
  const removable = Array.from(sessions.values())
    .filter((item) => item.snapshot.status !== "running" && item.snapshot.status !== "starting")
    .sort((a, b) => a.snapshot.updatedAt - b.snapshot.updatedAt);
  for (const item of removable) {
    if (sessions.size < MAX_ACTIVE_SHELLS) break;
    sessions.delete(item.snapshot.shellId);
  }
  if (sessions.size >= MAX_ACTIVE_SHELLS) {
    throw new Error(
      `Too many active shell sessions (${sessions.size}). Please close or wait older sessions first.`,
    );
  }
}

async function loadPersistedSnapshot(
  runtime: ServiceRuntime,
  shellId: string,
): Promise<ShellSessionSnapshot | null> {
  const file = getShellSnapshotPath(runtime.rootPath, shellId);
  if (!(await fs.pathExists(file))) return null;
  const raw = await fs.readJson(file).catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const snapshot = raw as ShellSessionSnapshot;
  return typeof snapshot.shellId === "string" ? snapshot : null;
}

async function readPersistedOutput(
  runtime: ServiceRuntime,
  shellId: string,
): Promise<string> {
  const file = getShellOutputPath(runtime.rootPath, shellId);
  if (!(await fs.pathExists(file))) return "";
  return await fs.readFile(file, "utf-8");
}

async function resolveSession(
  runtime: ServiceRuntime,
  query: ShellQueryRequest,
): Promise<ShellSessionRuntime | { snapshot: ShellSessionSnapshot; outputText: string } | null> {
  const explicitShellId = String(query.shellId || "").trim();
  if (explicitShellId) {
    const inMemory = sessions.get(explicitShellId);
    if (inMemory) return inMemory;
    const snapshot = await loadPersistedSnapshot(runtime, explicitShellId);
    if (!snapshot) return null;
    return {
      snapshot,
      outputText: await readPersistedOutput(runtime, explicitShellId),
    };
  }

  const ownerContextId = resolveOwnerContextId(query.ownerContextId);
  const cmd = String(query.cmd || "").trim().toLowerCase();
  if (!ownerContextId) return null;
  const includeCompleted = query.includeCompleted === true;
  const matched = Array.from(sessions.values())
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

function createOutputChunk(params: {
  shellId: string;
  outputText: string;
  fromCursor?: number;
  runtime: ServiceRuntime;
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
    runtime: params.runtime,
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

function buildActionResponse(params: {
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

function isInMemorySession(
  value: ShellSessionRuntime | { snapshot: ShellSessionSnapshot; outputText: string },
): value is ShellSessionRuntime {
  return "child" in value;
}

async function finalizeExit(session: ShellSessionRuntime, exitCode: number): Promise<void> {
  await updateSessionSnapshot(session, (snapshot) => {
    snapshot.status = deriveExitStatus(exitCode);
    snapshot.exitCode = exitCode;
    snapshot.endedAt = nowMs();
    snapshot.pid = session.child.pid ?? snapshot.pid;
  });
  scheduleCleanup(session.snapshot.shellId);

  if (
    session.snapshot.autoNotifyOnExit &&
    session.snapshot.notificationSent === false &&
    boundRuntime
  ) {
    await emitChatCompletionEvent(boundRuntime, session.snapshot);
    session.snapshot.notificationSent = true;
    await persistSnapshot(session);
  }
}

export function bindShellRuntime(runtime: ServiceRuntime): void {
  boundRuntime = runtime;
}

export async function closeAllShellSessions(force = false): Promise<void> {
  const closing = Array.from(sessions.values()).map(async (session) => {
    if (
      session.snapshot.status !== "running" &&
      session.snapshot.status !== "starting"
    ) {
      return;
    }
    try {
      session.child.kill(force ? "SIGKILL" : "SIGTERM");
    } catch {
      // ignore
    }
    await updateSessionSnapshot(session, (snapshot) => {
      snapshot.status = force ? "killed" : "failed";
      snapshot.exitCode = force ? -9 : -15;
      snapshot.endedAt = nowMs();
    });
  });
  await Promise.all(closing);
}

export async function startShellSession(
  runtime: ServiceRuntime,
  request: ShellStartRequest,
): Promise<ShellActionResponse> {
  const cmd = String(request.cmd || "").trim();
  if (!cmd) throw new Error("shell.start requires a non-empty cmd");
  ensureCapacity();
  bindShellRuntime(runtime);

  const shellId = `sh_${generateId()}`;
  const cwd = resolveShellCwd(runtime, request.cwd);
  const shellPath =
    String(request.shell || process.env.SHELL || "/bin/zsh").trim() || "/bin/zsh";
  const login = request.login !== false;
  const ownerContextId = resolveOwnerContextId(request.ownerContextId);
  const ownerRequestId = resolveOwnerRequestId();
  const canAutoNotifyByContext = ownerContextId
    ? Boolean(
        await readChatMetaByContextId({
          context: runtime,
          contextId: ownerContextId,
        }),
      )
    : false;
  const shellDir = getShellDir(runtime.rootPath, shellId);
  const snapshotFilePath = getShellSnapshotPath(runtime.rootPath, shellId);
  const outputFilePath = getShellOutputPath(runtime.rootPath, shellId);

  await fs.ensureDir(shellDir);
  await fs.writeFile(outputFilePath, "", "utf-8");

  const child = spawn(shellPath, [login ? "-lc" : "-c", cmd], {
    cwd,
    stdio: "pipe",
    env: buildShellEnv(runtime),
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  const startedAt = nowMs();
  const session: ShellSessionRuntime = {
    snapshot: {
      shellId,
      ...(ownerContextId ? { ownerContextId } : {}),
      ...(ownerRequestId ? { ownerRequestId } : {}),
      cmd,
      cwd,
      shellPath,
      status: "running",
      ...(typeof child.pid === "number" ? { pid: child.pid } : {}),
      startedAt,
      updatedAt: startedAt,
      outputChars: 0,
      droppedChars: 0,
      version: 1,
      autoNotifyOnExit: request.autoNotifyOnExit === true,
      notificationSent: false,
      externalRefs: [],
    },
    child,
    outputText: "",
    outputFilePath,
    snapshotFilePath,
    writeChain: Promise.resolve(),
    cleanupTimer: null,
    waiters: new Set(),
  };
  sessions.set(shellId, session);
  await persistSnapshot(session);

  child.stdout.on("data", (chunk: string | Buffer) => {
    void appendSessionOutput(session, String(chunk ?? ""));
  });
  child.stderr.on("data", (chunk: string | Buffer) => {
    void appendSessionOutput(session, String(chunk ?? ""));
  });
  child.on("error", (error: Error) => {
    void appendSessionOutput(session, `\n[process error] ${String(error)}\n`);
    void finalizeExit(session, -1);
  });
  child.on("close", (code: number | null) => {
    void finalizeExit(session, typeof code === "number" ? code : -1);
  });

  const inlineWaitMs = clampWaitMs(request.inlineWaitMs, DEFAULT_INLINE_WAIT_MS);
  await waitShellSession(runtime, {
    shellId,
    afterVersion: 1,
    fromCursor: 0,
    timeoutMs: inlineWaitMs,
    maxOutputTokens: request.maxOutputTokens,
  }).catch(() => undefined);

  const latest = await resolveSession(runtime, { shellId, includeCompleted: true });
  if (!latest) {
    throw new Error(`shell session disappeared unexpectedly: ${shellId}`);
  }
  if (
    isInMemorySession(latest) &&
    latest.snapshot.status === "running" &&
    latest.snapshot.autoNotifyOnExit === false &&
    request.autoNotifyOnExit !== false &&
    canAutoNotifyByContext
  ) {
    latest.snapshot.autoNotifyOnExit = true;
    await persistSnapshot(latest);
  }
  const chunk = createOutputChunk({
    shellId,
    outputText: latest.outputText,
    fromCursor: 0,
    runtime,
    maxOutputTokens: request.maxOutputTokens,
  });
  return buildActionResponse({
    shell: latest.snapshot,
    chunk,
    note:
      latest.snapshot.status === "running"
        ? "shell started and is still running"
        : "shell finished during inline wait",
  });
}

export async function getShellSessionStatus(
  runtime: ServiceRuntime,
  request: ShellQueryRequest,
): Promise<ShellActionResponse> {
  const session = await resolveSession(runtime, {
    ...request,
    includeCompleted: request.includeCompleted !== false,
  });
  if (!session) {
    throw new Error("shell session not found");
  }
  return buildActionResponse({
    shell: session.snapshot,
  });
}

export async function readShellSession(
  runtime: ServiceRuntime,
  request: ShellReadRequest,
): Promise<ShellActionResponse> {
  const session = await resolveSession(runtime, {
    ...request,
    includeCompleted: request.includeCompleted !== false,
  });
  if (!session) {
    throw new Error("shell session not found");
  }
  const chunk = createOutputChunk({
    shellId: session.snapshot.shellId,
    outputText: session.outputText,
    fromCursor: request.fromCursor,
    runtime,
    maxOutputTokens: request.maxOutputTokens,
  });
  return buildActionResponse({
    shell: session.snapshot,
    chunk,
  });
}

export async function writeShellSession(
  runtime: ServiceRuntime,
  request: ShellWriteRequest,
): Promise<ShellActionResponse> {
  const shellId = String(request.shellId || "").trim();
  const chars = String(request.chars ?? "");
  if (!shellId) throw new Error("shell.write requires shellId");
  const session = await resolveSession(runtime, {
    shellId,
    includeCompleted: true,
  });
  if (!session || !isInMemorySession(session)) {
    throw new Error("shell session is not active in memory");
  }
  if (session.snapshot.status !== "running" && session.snapshot.status !== "starting") {
    throw new Error(`shell session ${shellId} is not running`);
  }
  if (!session.child.stdin.writable) {
    throw new Error(`shell session ${shellId} stdin is closed`);
  }
  await new Promise<void>((resolve, reject) => {
    session.child.stdin.write(chars, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return buildActionResponse({
    shell: session.snapshot,
    note: chars ? "stdin written" : "no chars written",
  });
}

export async function waitShellSession(
  runtime: ServiceRuntime,
  request: ShellWaitRequest,
): Promise<ShellActionResponse> {
  const shellId = String(request.shellId || "").trim();
  if (!shellId) throw new Error("shell.wait requires shellId");
  const session = await resolveSession(runtime, {
    shellId,
    includeCompleted: true,
  });
  if (!session) throw new Error("shell session not found");

  if (
    isInMemorySession(session) &&
    typeof request.afterVersion === "number" &&
    session.snapshot.version <= request.afterVersion &&
    (session.snapshot.status === "running" || session.snapshot.status === "starting")
  ) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        session.waiters.delete(waiter);
        resolve();
      }, clampWaitMs(request.timeoutMs, DEFAULT_WAIT_TIMEOUT_MS));
      const waiter: SessionWaiter = {
        resolve: () => resolve(),
        timer,
      };
      session.waiters.add(waiter);
    });
  }

  const refreshed = await resolveSession(runtime, {
    shellId,
    includeCompleted: true,
  });
  if (!refreshed) throw new Error("shell session not found after wait");
  const chunk = createOutputChunk({
    shellId,
    outputText: refreshed.outputText,
    fromCursor: request.fromCursor,
    runtime,
    maxOutputTokens: request.maxOutputTokens,
  });
  return buildActionResponse({
    shell: refreshed.snapshot,
    chunk,
  });
}

export async function closeShellSession(
  runtime: ServiceRuntime,
  request: ShellCloseRequest,
): Promise<ShellActionResponse> {
  const shellId = String(request.shellId || "").trim();
  if (!shellId) throw new Error("shell.close requires shellId");
  const session = await resolveSession(runtime, {
    shellId,
    includeCompleted: true,
  });
  if (!session) throw new Error("shell session not found");

  if (!isInMemorySession(session)) {
    return buildActionResponse({
      shell: session.snapshot,
      note: "shell already completed and only persisted snapshot remains",
    });
  }

  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = null;
  }

  if (session.snapshot.status === "running" || session.snapshot.status === "starting") {
    try {
      session.child.kill(request.force === true ? "SIGKILL" : "SIGTERM");
    } catch {
      // ignore
    }
    await updateSessionSnapshot(session, (snapshot) => {
      snapshot.status = request.force === true ? "killed" : "failed";
      snapshot.exitCode = request.force === true ? -9 : -15;
      snapshot.endedAt = nowMs();
    });
  }

  scheduleCleanup(shellId);
  return buildActionResponse({
    shell: session.snapshot,
    note: "shell close requested",
  });
}

export async function execShellCommand(
  runtime: ServiceRuntime,
  request: ShellExecRequest,
): Promise<ShellActionResponse> {
  const timeoutMs = clampWaitMs(request.timeoutMs, DEFAULT_EXEC_TIMEOUT_MS);
  const started = await startShellSession(runtime, {
    cmd: request.cmd,
    ...(request.cwd ? { cwd: request.cwd } : {}),
    ...(request.shell ? { shell: request.shell } : {}),
    login: request.login,
    inlineWaitMs: Math.min(DEFAULT_INLINE_WAIT_MS, timeoutMs),
    maxOutputTokens: request.maxOutputTokens,
    autoNotifyOnExit: false,
  });

  let current = started;
  let fromCursor = current.chunk?.endCursor ?? 0;
  const outputParts: string[] = [];
  if (current.chunk?.output) {
    outputParts.push(current.chunk.output);
  }

  const deadline = nowMs() + timeoutMs;
  while (!isTerminalStatus(current.shell.status)) {
    const remaining = deadline - nowMs();
    if (remaining <= 0) {
      await closeShellSession(runtime, {
        shellId: current.shell.shellId,
        force: true,
      });
      throw new Error(
        `shell.exec timed out after ${timeoutMs}ms. Use shell_start for long-running commands.`,
      );
    }

    current = await waitShellSession(runtime, {
      shellId: current.shell.shellId,
      afterVersion: current.shell.version,
      fromCursor,
      timeoutMs: remaining,
      maxOutputTokens: request.maxOutputTokens,
    });
    if (current.chunk?.output) {
      outputParts.push(current.chunk.output);
    }
    if (current.chunk && typeof current.chunk.endCursor === "number") {
      fromCursor = current.chunk.endCursor;
    }
  }

  await closeShellSession(runtime, {
    shellId: current.shell.shellId,
    force: false,
  }).catch(() => undefined);

  const fullOutput = outputParts.join("");
  const originalLines = fullOutput ? fullOutput.split("\n").length : 0;
  return buildActionResponse({
    shell: current.shell,
    chunk: {
      shellId: current.shell.shellId,
      output: fullOutput,
      startCursor: 0,
      endCursor: fullOutput.length,
      originalChars: fullOutput.length,
      originalLines,
      hasMoreOutput: false,
    },
    note: "shell exec completed in one-shot mode",
  });
}
