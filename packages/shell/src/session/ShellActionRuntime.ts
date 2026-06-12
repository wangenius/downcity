/**
 * Shell action 运行时编排入口。
 *
 * 关键点（中文）
 * - 这里只负责编排 shell plugin runtime 的公开动作：start/status/read/write/wait/close/exec。
 * - 持久化、输出裁剪、waiter 协调、session 查找等共享细节拆到 `ShellActionRuntimeSupport.ts`。
 * - 新版本所有状态都通过 ShellPluginState 显式传入，不再使用模块级单例。
 */

import fs from "fs-extra";
import type { ShellHostContext } from "@/types/ShellHostContext.js";
import { spawnShellProcess } from "@/sandbox/SandboxRunner.js";
import type {
  ShellPluginState,
  ShellSessionRuntimeState,
  ShellSessionWaiter,
} from "@/session/ShellRuntimeTypes.js";
import { generateId } from "@/utils/Id.js";
import type {
  ShellActionResponse,
  ShellApprovalStatus,
  ShellCloseRequest,
  ShellExecRequest,
  ShellQueryRequest,
  ShellReadRequest,
  ShellStartRequest,
  ShellWaitRequest,
  ShellWriteRequest,
} from "@/types/ShellPlugin.js";
import { getShellDir, getShellOutputPath, getShellSnapshotPath } from "./Paths.js";
import {
  buildActionResponse,
  buildShellEnv,
  clampWaitMsWithOptions,
  createOutputChunk,
  createShellPluginState,
  ensureCapacity,
  isInMemorySession,
  isTerminalStatus,
  nowMs,
  persistSnapshot,
  resolveOwnerContextId,
  resolveSession,
  resolveShellCwd,
  scheduleCleanup,
  updateSessionSnapshot,
} from "./ShellActionRuntimeSupport.js";
import { attachShellProcessEventHandlers } from "./ShellProcessEvents.js";
import {
  listPendingApprovals,
  requestUnrestrictedApproval,
  resolveApproval,
  validateUnrestrictedRequest,
} from "../approval/ShellApprovalRuntime.js";

export { createShellPluginState } from "./ShellActionRuntimeSupport.js";

function resolveDefaultShellPath(): string {
  const envShell = String(process.env.SHELL || "").trim();
  if (envShell) return envShell;
  return process.platform === "darwin" ? "/bin/zsh" : "/bin/sh";
}

/**
 * 绑定当前 shell plugin runtime 实例的 execution runtime。
 */
export function bindShellRuntime(
  state: ShellPluginState,
  context: ShellHostContext,
): void {
  state.context = context;
}

/**
 * 关闭当前实例持有的所有活动 shell。
 */
export async function closeAllShellSessions(
  state: ShellPluginState,
  force = false,
): Promise<void> {
  for (const approval of Array.from(state.approvals.values())) {
    if (state.context) {
      await resolveApproval({
        state,
        context: state.context,
        approvalId: approval.approvalId,
        decision: "expired",
      }).catch(() => undefined);
      continue;
    }
    clearTimeout(approval.timer);
    state.approvals.delete(approval.approvalId);
    approval.resolve("expired");
  }
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

function resolveSandboxMode(value: unknown): "safe" | "unrestricted" {
  return value === "unrestricted" ? "unrestricted" : "safe";
}

function buildDeniedApprovalResponse(params: {
  shellId: string;
  ownerContextId?: string;
  cmd: string;
  cwd: string;
  shellPath: string;
  approvalId: string;
  reason: string;
  approvalStatus: ShellApprovalStatus;
}): ShellActionResponse {
  const now = nowMs();
  const message = params.approvalStatus === "expired"
    ? "Unrestricted sandbox approval expired."
    : "User denied unrestricted sandbox execution.";
  return buildActionResponse({
    shell: {
      shellId: params.shellId,
      ...(params.ownerContextId ? { ownerContextId: params.ownerContextId } : {}),
      cmd: params.cmd,
      cwd: params.cwd,
      shellPath: params.shellPath,
      sandboxed: false,
      sandboxMode: "unrestricted",
      sandboxBackend: "unrestricted-host",
      sandboxNetworkMode: "full",
      approvalStatus: params.approvalStatus,
      approvalId: params.approvalId,
      approvalReason: params.reason,
      stdinWritable: true,
      status: params.approvalStatus === "expired" ? "expired" : "failed",
      startedAt: now,
      updatedAt: now,
      endedAt: now,
      exitCode: -1,
      lastOutputPreview: message,
      outputChars: message.length,
      droppedChars: 0,
      version: 1,
      autoNotifyOnExit: false,
      notificationSent: false,
      externalRefs: [],
    },
    chunk: {
      shellId: params.shellId,
      output: message,
      startCursor: 0,
      endCursor: message.length,
      originalChars: message.length,
      originalLines: 1,
      hasMoreOutput: false,
    },
    note: message,
  });
}

function buildDeniedWriteApprovalResponse(params: {
  session: ShellSessionRuntimeState;
  approvalId: string;
  reason: string;
  approvalStatus: ShellApprovalStatus;
}): ShellActionResponse {
  const message = params.approvalStatus === "expired"
    ? "Unrestricted sandbox approval expired."
    : "User denied unrestricted sandbox execution.";
  return buildActionResponse({
    shell: {
      ...params.session.snapshot,
      approvalStatus: params.approvalStatus,
      approvalId: params.approvalId,
      approvalReason: params.reason,
      stdinWritable: true,
    },
    chunk: {
      shellId: params.session.snapshot.shellId,
      output: message,
      startCursor: 0,
      endCursor: message.length,
      originalChars: message.length,
      originalLines: 1,
      hasMoreOutput: false,
    },
    note: message,
  });
}

/**
 * 启动一个 shell session。
 */
export async function startShellSession(
  state: ShellPluginState,
  context: ShellHostContext,
  request: ShellStartRequest,
): Promise<ShellActionResponse> {
  const cmd = String(request.cmd || "").trim();
  if (!cmd) throw new Error("shell.start requires a non-empty cmd");
  ensureCapacity(state);
  bindShellRuntime(state, context);

  const shellId = `sh_${generateId()}`;
  const cwd = resolveShellCwd(context, request.cwd);
  const shellPath =
    String(request.shell || resolveDefaultShellPath()).trim() || resolveDefaultShellPath();
  const login = request.login !== false;
  const sandboxMode = resolveSandboxMode(request.sandbox);
  const reason = String(request.reason || "").trim();
  const ownerContextId = resolveOwnerContextId(context, request.ownerContextId);
  const canAutoNotifyByContext = ownerContextId
    ? Boolean(
        await context.shellIntegration?.readChatMeta?.({ context, sessionId: ownerContextId }),
      )
    : false;
  const shellDir = getShellDir(context.rootPath, shellId);
  const snapshotFilePath = getShellSnapshotPath(context.rootPath, shellId);
  const outputFilePath = getShellOutputPath(context.rootPath, shellId);

  await fs.ensureDir(shellDir);
  await fs.writeFile(outputFilePath, "", "utf-8");

  let approvalId: string | undefined;
  let approvalStatus: ShellApprovalStatus | undefined;
  if (sandboxMode === "unrestricted") {
    const validationError = validateUnrestrictedRequest({ cmd, reason });
    if (validationError) throw new Error(validationError);
    const approval = await requestUnrestrictedApproval({
      state,
      context,
      shellId,
      toolName: request.approvalToolName || "shell_start",
      cmd,
      cwd,
      reason,
      ...(ownerContextId ? { ownerContextId } : {}),
    });
    approvalId = approval.approvalId;
    approvalStatus = approval.status;
    if (approval.status !== "approved") {
      return buildDeniedApprovalResponse({
        shellId,
        ...(ownerContextId ? { ownerContextId } : {}),
        cmd,
        cwd,
        shellPath,
        approvalId: approval.approvalId,
        reason,
        approvalStatus: approval.status,
      });
    }
  }

  const spawnResult = await spawnShellProcess({
    context,
    shellId,
    shellDir,
    cmd,
    cwd,
    shellPath,
    login,
    baseEnv: buildShellEnv(context),
    sandboxMode,
  });
  const child = spawnResult.child;
  const actualCwd = spawnResult.cwd;

  const startedAt = nowMs();
  let resolveCompletion: () => void = () => {};
  const completionPromise = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
  const session: ShellSessionRuntimeState = {
    snapshot: {
      shellId,
      ...(ownerContextId ? { ownerContextId } : {}),
      cmd,
      cwd: actualCwd,
      shellPath,
      sandboxed: spawnResult.sandboxed,
      sandboxMode: spawnResult.sandboxMode || sandboxMode,
      sandboxBackend: spawnResult.backend,
      sandboxNetworkMode: spawnResult.networkMode,
      sandboxDir: spawnResult.sandboxDir,
      sandboxHomeDir: spawnResult.homeDir,
      sandboxTmpDir: spawnResult.tmpDir,
      sandboxCacheDir: spawnResult.cacheDir,
      ...(approvalStatus ? { approvalStatus } : {}),
      ...(approvalId ? { approvalId } : {}),
      ...(reason ? { approvalReason: reason } : {}),
      stdinWritable: true,
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
    waiters: new Set<ShellSessionWaiter>(),
    completionPromise,
    resolveCompletion,
  };
  state.sessions.set(shellId, session);

  // 关键点（中文）
  // - 监听器必须在任何 `await` 之前挂上。
  // - 对于 `printf` 这类瞬时命令，进程可能在持久化 snapshot 期间就已经退出。
  // - 如果先 `await persistSnapshot()` 再注册 `close`，会错过退出事件，导致 session 永远停在 running。
  attachShellProcessEventHandlers({ state, session });
  await persistSnapshot(session);

  const inlineWaitMs = clampWaitMsWithOptions(
    state.options,
    request.inlineWaitMs,
    state.options.defaultInlineWaitMs,
  );
  await waitShellSession(state, context, {
    shellId,
    afterVersion: 1,
    fromCursor: 0,
    timeoutMs: inlineWaitMs,
    maxOutputTokens: request.maxOutputTokens,
  }).catch(() => undefined);

  const latest = await resolveSession(state, context, { shellId, includeCompleted: true });
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
    context,
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
  state: ShellPluginState,
  context: ShellHostContext,
  request: ShellQueryRequest,
): Promise<ShellActionResponse> {
  const session = await resolveSession(state, context, {
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
  state: ShellPluginState,
  context: ShellHostContext,
  request: ShellReadRequest,
): Promise<ShellActionResponse> {
  const session = await resolveSession(state, context, {
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
    context,
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
  state: ShellPluginState,
  context: ShellHostContext,
  request: ShellWriteRequest,
): Promise<ShellActionResponse> {
  const shellId = String(request.shellId || "").trim();
  const chars = String(request.chars ?? "");
  if (!shellId) throw new Error("shell.write requires shellId");
  const session = await resolveSession(state, context, {
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
  if (session.snapshot.stdinWritable === false) {
    throw new Error(`shell session ${shellId} stdin is closed`);
  }

  let approvalId: string | undefined;
  let approvalStatus: ShellApprovalStatus | undefined;
  const reason = String(request.reason || "").trim();
  if (session.snapshot.sandboxMode === "unrestricted") {
    const validationError = validateUnrestrictedRequest({ cmd: chars, reason });
    if (validationError) throw new Error(validationError);
    const approval = await requestUnrestrictedApproval({
      state,
      context,
      shellId,
      toolName: "shell_write",
      cmd: chars,
      cwd: session.snapshot.cwd,
      reason,
      ...(session.snapshot.ownerContextId ? { ownerContextId: session.snapshot.ownerContextId } : {}),
      inputPreview: chars,
      inputChars: chars.length,
    });
    approvalId = approval.approvalId;
    approvalStatus = approval.status;
    if (approval.status !== "approved") {
      return buildDeniedWriteApprovalResponse({
        session,
        approvalId: approval.approvalId,
        reason,
        approvalStatus: approval.status,
      });
    }
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
    shell: {
      ...session.snapshot,
      ...(approvalStatus ? { approvalStatus } : {}),
      ...(approvalId ? { approvalId } : {}),
      ...(reason ? { approvalReason: reason } : {}),
      stdinWritable: true,
    },
    note: chars ? "stdin written" : "no chars written",
  });
}

/**
 * 等待 shell session 状态变化。
 */
export async function waitShellSession(
  state: ShellPluginState,
  context: ShellHostContext,
  request: ShellWaitRequest,
): Promise<ShellActionResponse> {
  const shellId = String(request.shellId || "").trim();
  if (!shellId) throw new Error("shell.wait requires shellId");
  const session = await resolveSession(state, context, {
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
      let waiter: ShellSessionWaiter;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(waiter.timer);
        session.waiters.delete(waiter);
        resolve();
      };
      const timer = setTimeout(() => {
        finish();
      }, clampWaitMsWithOptions(
        state.options,
        request.timeoutMs,
        state.options.defaultWaitTimeoutMs,
      ));
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

  const refreshed = await resolveSession(state, context, {
    shellId,
    includeCompleted: true,
  });
  if (!refreshed) throw new Error("shell session not found after wait");
  const chunk = createOutputChunk({
    shellId,
    outputText: refreshed.outputText,
    fromCursor: request.fromCursor,
    context,
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
  state: ShellPluginState,
  context: ShellHostContext,
  request: ShellCloseRequest,
): Promise<ShellActionResponse> {
  const shellId = String(request.shellId || "").trim();
  if (!shellId) throw new Error("shell.close requires shellId");
  const session = await resolveSession(state, context, {
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
  state: ShellPluginState,
  context: ShellHostContext,
  request: ShellExecRequest,
): Promise<ShellActionResponse> {
  const timeoutMs = clampWaitMsWithOptions(
    state.options,
    request.timeoutMs,
    state.options.defaultExecTimeoutMs,
  );
  const started = await startShellSession(state, context, {
    cmd: request.cmd,
    ...(request.cwd ? { cwd: request.cwd } : {}),
    ...(request.shell ? { shell: request.shell } : {}),
    login: request.login,
    sandbox: request.sandbox,
    reason: request.reason,
    approvalToolName: "shell_exec",
    inlineWaitMs: Math.min(state.options.defaultInlineWaitMs, timeoutMs),
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
      await closeShellSession(state, context, {
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

    const refreshed = await resolveSession(state, context, {
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
      context,
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

  await closeShellSession(state, context, {
    shellId: current.shell.shellId,
    force: false,
  }).catch(() => undefined);

  const completed = await resolveSession(state, context, {
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

/**
 * 列出 pending unrestricted sandbox 审批。
 */
export function listShellApprovals(state: ShellPluginState) {
  return listPendingApprovals(state);
}

/**
 * 批准 pending unrestricted sandbox 审批。
 */
export async function approveShellApproval(
  state: ShellPluginState,
  context: ShellHostContext,
  approvalId: string,
): Promise<boolean> {
  return await resolveApproval({
    state,
    context,
    approvalId,
    decision: "approved",
  });
}

/**
 * 拒绝 pending unrestricted sandbox 审批。
 */
export async function denyShellApproval(
  state: ShellPluginState,
  context: ShellHostContext,
  approvalId: string,
): Promise<boolean> {
  return await resolveApproval({
    state,
    context,
    approvalId,
    decision: "denied",
  });
}
