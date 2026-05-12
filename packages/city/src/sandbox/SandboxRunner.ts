/**
 * SandboxRunner 入口。
 *
 * 关键点（中文）
 * - 这里不实现完整的 session/read/write 协议，只负责 shell 子进程创建时统一进入 sandbox backend。
 * - 当前版本只接入 macOS seatbelt backend。
 * - shell 命令不再允许回退到宿主机普通子进程执行。
 */

import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { SandboxSpawnResult } from "@/types/sandbox/SandboxRuntime.js";
import { resolveSandboxConfig, resolveSandboxCwd } from "@/sandbox/SandboxConfigResolver.js";
import { spawnMacOsSeatbeltSandbox } from "@/sandbox/MacOsSeatbeltSandbox.js";

/**
 * 启动 shell 子进程。
 */
export async function spawnShellProcess(params: {
  context: AgentContext;
  shellId: string;
  shellDir: string;
  cmd: string;
  cwd: string;
  shellPath: string;
  login: boolean;
  baseEnv: NodeJS.ProcessEnv;
}): Promise<SandboxSpawnResult> {
  const config = resolveSandboxConfig(params.context);
  const actualCwd = resolveSandboxCwd({
    rootPath: config.rootPath,
    requestedCwd: params.cwd,
    context: params.context,
  });
  return spawnMacOsSeatbeltSandbox({
    shellId: params.shellId,
    shellDir: params.shellDir,
    cmd: params.cmd,
    cwd: params.cwd,
    shellPath: params.shellPath,
    login: params.login,
    baseEnv: params.baseEnv,
    config,
    actualCwd,
  });
}

/**
 * 执行一次 one-shot sandbox 命令并等待结束。
 *
 * 关键点（中文）
 * - 供 task script 这类“直接执行命令但不需要 shell session 管理”的路径复用。
 * - 非零退出码会直接抛错，行为与原先 `execa(..., { reject: true })` 保持一致。
 */
export async function runSandboxCommand(params: {
  context: AgentContext;
  shellId: string;
  shellDir: string;
  cmd: string;
  cwd: string;
  shellPath: string;
  login: boolean;
  baseEnv: NodeJS.ProcessEnv;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  spawn: SandboxSpawnResult;
}> {
  const spawn = await spawnShellProcess(params);
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  spawn.child.stdout.on("data", (chunk: string | Buffer) => {
    stdoutChunks.push(String(chunk ?? ""));
  });
  spawn.child.stderr.on("data", (chunk: string | Buffer) => {
    stderrChunks.push(String(chunk ?? ""));
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    spawn.child.on("error", (error) => reject(error));
    spawn.child.on("close", (code) => resolve(typeof code === "number" ? code : -1));
  });

  const stdout = stdoutChunks.join("");
  const stderr = stderrChunks.join("");
  if (exitCode !== 0) {
    const message = [stdout.trim(), stderr.trim()]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(message || `Sandbox command failed with exit code ${exitCode}`);
  }

  return {
    stdout,
    stderr,
    exitCode,
    spawn,
  };
}
