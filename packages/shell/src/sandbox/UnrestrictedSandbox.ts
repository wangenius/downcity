/**
 * Unrestricted sandbox backend。
 *
 * 关键点（中文）
 * - 这是 Downcity Runtime 管理的高权限执行环境，不是 agent 直接访问宿主 shell。
 * - 进程继承宿主可见文件系统与环境边界，但必须由上层 approval 流程批准后才能调用。
 * - 本 backend 只负责 spawn，不做审批、审计或风险判断。
 */

import { spawn } from "node:child_process";
import fs from "fs-extra";
import {
  createPipeProcessHandle,
  spawnPtyProcessHandle,
} from "@/sandbox/ShellProcessHandle.js";
import type {
  SandboxSpawnParams,
  SandboxSpawnResult,
} from "@/sandbox/types/SandboxRuntime.js";

/**
 * 在 unrestricted sandbox 中启动 shell 子进程。
 */
export async function spawnUnrestrictedSandbox(
  params: Omit<SandboxSpawnParams, "config"> & { actualCwd: string },
): Promise<SandboxSpawnResult> {
  await fs.ensureDir(params.executionDir);

  const args = [
    params.login ? "-lc" : "-c",
    params.cmd,
  ];
  const child = params.terminal
    ? spawnPtyProcessHandle({
        command: params.shellPath,
        args,
        cwd: params.actualCwd,
        env: params.baseEnv,
        terminal: { cols: params.cols, rows: params.rows },
      })
    : createPipeProcessHandle(
        spawn(params.shellPath, args, {
          cwd: params.actualCwd,
          stdio: "pipe",
          env: params.baseEnv,
        }),
      );

  return {
    child,
    cwd: params.actualCwd,
    sandboxed: false,
    sandboxMode: "unrestricted",
    backend: "unrestricted-host",
    networkMode: "full",
    sandboxDir: "",
    homeDir: String(params.baseEnv.HOME || ""),
    tmpDir: String(params.baseEnv.TMPDIR || "/tmp"),
    cacheDir: String(params.baseEnv.XDG_CACHE_HOME || ""),
  };
}
