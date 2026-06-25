/**
 * Shell exec action。
 *
 * 关键点（中文）
 * - exec 是基于 start + wait + close 的 one-shot 编排。
 * - 保留完整输出返回，适合短命令。
 */

import type { ShellHostContext } from "@/types/ShellHostContext.js";
import type { ShellRuntimeState } from "@/session/ShellRuntimeTypes.js";
import type {
  ShellActionResponse,
  ShellExecRequest,
} from "@/types/ShellAction.js";
import {
  buildActionResponse,
  clampWaitMsWithOptions,
  createOutputChunk,
  isTerminalStatus,
  nowMs,
  resolveSession,
} from "../ShellActionRuntimeSupport.js";
import { closeShellSession } from "./ShellQueryActions.js";
import { startShellSession } from "./ShellStartActions.js";

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
}

/**
 * 以 one-shot 模式执行 shell command。
 */
export async function execShellCommand(
  state: ShellRuntimeState,
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
    ...(request.ownerContextId ? { ownerContextId: request.ownerContextId } : {}),
    ...(request.turnId ? { turnId: request.turnId } : {}),
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
