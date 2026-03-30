/**
 * Shell session 运行时存储入口。
 *
 * 关键点（中文）
 * - 这里只负责编排 shell service 的公开动作：start/status/read/write/wait/close/exec。
 * - 持久化、输出裁剪、waiter 协调、session 查找等共享细节拆到 `SessionStoreSupport.ts`。
 * - 新版本所有状态都通过 ShellServiceState 显式传入，不再使用模块级单例。
 */

import { spawn } from "node:child_process";
import fs from "fs-extra";
import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import type {
  SessionWaiter,
  ShellServiceState,
  ShellSessionRuntime,
} from "@/types/ShellRuntime.js";
import { generateId } from "@utils/Id.js";
import { readChatMetaBySessionId } from "@services/chat/runtime/ChatMetaStore.js";
import type {
  ShellActionResponse,
  ShellCloseRequest,
  ShellExecRequest,
  ShellQueryRequest,
  ShellReadRequest,
  ShellStartRequest,
  ShellWaitRequest,
  ShellWriteRequest,
} from "@services/shell/types/ShellService.js";
import { getShellDir, getShellOutputPath, getShellSnapshotPath } from "./Paths.js";
import {
  appendSessionOutput,
  buildActionResponse,
  buildShellEnv,
  clampWaitMs,
  createOutputChunk,
  createShellServiceState,
  DEFAULT_EXEC_TIMEOUT_MS,
  DEFAULT_INLINE_WAIT_MS,
  DEFAULT_WAIT_TIMEOUT_MS,
  ensureCapacity,
  finalizeExit,
  isInMemorySession,
  isTerminalStatus,
  nowMs,
  persistSnapshot,
  resolveOwnerContextId,
  resolveOwnerRequestId,
  resolveSession,
  resolveShellCwd,
  scheduleCleanup,
  updateSessionSnapshot,
} from "./SessionStoreSupport.js";

export { createShellServiceState } from "./SessionStoreSupport.js";

/**
 * 绑定当前 shell service 实例的 execution runtime。
 */
export function bindShellRuntime(
  state: ShellServiceState,
  runtime: ExecutionRuntime,
): void {
  state.boundRuntime = runtime;
}

/**
 * 关闭当前实例持有的所有活动 shell。
 */
export async function closeAllShellSessions(
  state: ShellServiceState,
  force = false,
): Promise<void> {
  const closing = Array.from(state.sessions.values()).map(async (session) => {
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

/**
 * 启动一个 shell session。
 */
export async function startShellSession(
  state: ShellServiceState,
  runtime: ExecutionRuntime,
  request: ShellStartRequest,
): Promise<ShellActionResponse> {
  const cmd = String(request.cmd || "").trim();
  if (!cmd) throw new Error("shell.start requires a non-empty cmd");
  ensureCapacity(state);
  bindShellRuntime(state, runtime);

  const shellId = `sh_${generateId()}`;
  const cwd = resolveShellCwd(runtime, request.cwd);
  const shellPath =
    String(request.shell || process.env.SHELL || "/bin/zsh").trim() || "/bin/zsh";
  const login = request.login !== false;
  const ownerContextId = resolveOwnerContextId(request.ownerContextId);
  const ownerRequestId = resolveOwnerRequestId();
  const canAutoNotifyByContext = ownerContextId
    ? Boolean(
        await readChatMetaBySessionId({
          context: runtime,
          sessionId: ownerContextId,
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
  let resolveCompletion: () => void = () => {};
  const completionPromise = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
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
    waiters: new Set<SessionWaiter>(),
    completionPromise,
    resolveCompletion,
  };
  state.sessions.set(shellId, session);

  // 关键点（中文）
  // - 监听器必须在任何 `await` 之前挂上。
  // - 对于 `printf` 这类瞬时命令，进程可能在持久化 snapshot 期间就已经退出。
  // - 如果先 `await persistSnapshot()` 再注册 `close`，会错过退出事件，导致 session 永远停在 running。
  child.stdout.on("data", (chunk: string | Buffer) => {
    void appendSessionOutput(session, String(chunk ?? "")).catch(() => undefined);
  });
  child.stderr.on("data", (chunk: string | Buffer) => {
    void appendSessionOutput(session, String(chunk ?? "")).catch(() => undefined);
  });
  child.on("error", (error: Error) => {
    void appendSessionOutput(session, `\n[process error] ${String(error)}\n`).catch(
      () => undefined,
    );
    void finalizeExit(state, session, -1).catch(() => undefined);
  });
  child.on("close", (code: number | null) => {
    void finalizeExit(state, session, typeof code === "number" ? code : -1).catch(
      () => undefined,
    );
  });
  await persistSnapshot(session);

  const inlineWaitMs = clampWaitMs(request.inlineWaitMs, DEFAULT_INLINE_WAIT_MS);
  await waitShellSession(state, runtime, {
    shellId,
    afterVersion: 1,
    fromCursor: 0,
    timeoutMs: inlineWaitMs,
    maxOutputTokens: request.maxOutputTokens,
  }).catch(() => undefined);

  const latest = await resolveSession(state, runtime, { shellId, includeCompleted: true });
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

/**
 * 查询 shell session 状态。
 */
export async function getShellSessionStatus(
  state: ShellServiceState,
  runtime: ExecutionRuntime,
  request: ShellQueryRequest,
): Promise<ShellActionResponse> {
  const session = await resolveSession(state, runtime, {
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

/**
 * 读取 shell session 输出。
 */
export async function readShellSession(
  state: ShellServiceState,
  runtime: ExecutionRuntime,
  request: ShellReadRequest,
): Promise<ShellActionResponse> {
  const session = await resolveSession(state, runtime, {
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

/**
 * 向 shell session 写入 stdin。
 */
export async function writeShellSession(
  state: ShellServiceState,
  runtime: ExecutionRuntime,
  request: ShellWriteRequest,
): Promise<ShellActionResponse> {
  const shellId = String(request.shellId || "").trim();
  const chars = String(request.chars ?? "");
  if (!shellId) throw new Error("shell.write requires shellId");
  const session = await resolveSession(state, runtime, {
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

/**
 * 等待 shell session 状态变化。
 */
export async function waitShellSession(
  state: ShellServiceState,
  runtime: ExecutionRuntime,
  request: ShellWaitRequest,
): Promise<ShellActionResponse> {
  const shellId = String(request.shellId || "").trim();
  if (!shellId) throw new Error("shell.wait requires shellId");
  const session = await resolveSession(state, runtime, {
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
    const afterVersion = request.afterVersion;
    await new Promise<void>((resolve) => {
      let settled = false;
      let waiter: SessionWaiter;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(waiter.timer);
        session.waiters.delete(waiter);
        resolve();
      };
      const timer = setTimeout(() => {
        finish();
      }, clampWaitMs(request.timeoutMs, DEFAULT_WAIT_TIMEOUT_MS));
      waiter = {
        resolve: finish,
        timer,
      };
      session.waiters.add(waiter);

      // 关键点（中文）
      // - 这里必须在注册 waiter 之后立刻复查一次状态。
      // - 否则如果 shell 恰好在“进入 if 判断”与“waiter 真正挂入集合”之间完成，
      //   notifyWaiters 会被错过，导致当前 wait 一直睡到 timeout。
      if (
        session.snapshot.version > afterVersion ||
        isTerminalStatus(session.snapshot.status)
      ) {
        finish();
      }
    });
  }

  const refreshed = await resolveSession(state, runtime, {
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

/**
 * 关闭 shell session。
 */
export async function closeShellSession(
  state: ShellServiceState,
  runtime: ExecutionRuntime,
  request: ShellCloseRequest,
): Promise<ShellActionResponse> {
  const shellId = String(request.shellId || "").trim();
  if (!shellId) throw new Error("shell.close requires shellId");
  const session = await resolveSession(state, runtime, {
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

  scheduleCleanup(state, shellId);
  return buildActionResponse({
    shell: session.snapshot,
    note: "shell close requested",
  });
}

/**
 * 以 one-shot 模式执行 shell command。
 */
export async function execShellCommand(
  state: ShellServiceState,
  runtime: ExecutionRuntime,
  request: ShellExecRequest,
): Promise<ShellActionResponse> {
  const timeoutMs = clampWaitMs(request.timeoutMs, DEFAULT_EXEC_TIMEOUT_MS);
  const started = await startShellSession(state, runtime, {
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
  const sleep = async (ms: number): Promise<void> => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (typeof timer.unref === "function") timer.unref();
    });
  };
  while (!isTerminalStatus(current.shell.status)) {
    const remaining = deadline - nowMs();
    if (remaining <= 0) {
      await closeShellSession(state, runtime, {
        shellId: current.shell.shellId,
        force: true,
      });
      throw new Error(
        `shell.exec timed out after ${timeoutMs}ms. Use shell_start for long-running commands.`,
      );
    }

    const inMemory = state.sessions.get(current.shell.shellId);
    if (
      inMemory &&
      (inMemory.snapshot.status === "running" ||
        inMemory.snapshot.status === "starting")
    ) {
      await Promise.race([
        inMemory.completionPromise,
        sleep(Math.min(remaining, 250)),
      ]);
    } else {
      await sleep(Math.min(remaining, 250));
    }

    const refreshed = await resolveSession(state, runtime, {
      shellId: current.shell.shellId,
      includeCompleted: true,
    });
    if (!refreshed) {
      throw new Error(`shell session disappeared unexpectedly: ${current.shell.shellId}`);
    }
    const chunk = createOutputChunk({
      shellId: current.shell.shellId,
      outputText: refreshed.outputText,
      fromCursor,
      runtime,
      maxOutputTokens: request.maxOutputTokens,
    });
    current = buildActionResponse({
      shell: refreshed.snapshot,
      chunk,
    });
    if (chunk.output) {
      outputParts.push(chunk.output);
    }
    if (typeof chunk.endCursor === "number") {
      fromCursor = chunk.endCursor;
    }
  }

  const finalSession = state.sessions.get(current.shell.shellId);
  if (finalSession) {
    await finalSession.completionPromise;
    await finalSession.writeChain.catch(() => undefined);
  }

  await closeShellSession(state, runtime, {
    shellId: current.shell.shellId,
    force: false,
  }).catch(() => undefined);

  const completed = await resolveSession(state, runtime, {
    shellId: current.shell.shellId,
    includeCompleted: true,
  });
  const fullOutput = completed?.outputText ?? outputParts.join("");
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
