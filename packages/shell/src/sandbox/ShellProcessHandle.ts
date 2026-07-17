/**
 * Shell 进程句柄适配器。
 *
 * 关键点（中文）
 * - Node pipe 子进程与 PTY 子进程的事件/写入 API 不一致。
 * - shell runtime 只需要统一的输出、退出、写入和关闭协议；这里把差异收敛掉。
 */

import { spawn as spawnPty } from "node-pty";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  ShellProcessHandle,
} from "@/types/Sandbox.js";

/**
 * 把普通 pipe 子进程包装成 shell process handle。
 */
export function createPipeProcessHandle(
  child: ChildProcessWithoutNullStreams,
): ShellProcessHandle {
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return {
    pid: child.pid,
    get writable() {
      return child.stdin.writable;
    },
    onData(callback) {
      child.stdout.on("data", callback);
      child.stderr.on("data", callback);
    },
    onExit(callback) {
      child.on("close", (code) => callback(typeof code === "number" ? code : -1));
    },
    onError(callback) {
      child.on("error", callback);
    },
    async write(chars) {
      await new Promise<void>((resolve, reject) => {
        child.stdin.write(chars, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    kill(signal) {
      child.kill(signal);
    },
  };
}

/**
 * 使用 PTY 启动并包装成 shell process handle。
 */
export function spawnPtyProcessHandle(params: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  terminal?: {
    /** PTY 列数。 */
    cols?: number;
    /** PTY 行数。 */
    rows?: number;
  };
}): ShellProcessHandle {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(params.env)) {
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  const pty = spawnPty(params.command, params.args, {
    name: "xterm-256color",
    cwd: params.cwd,
    env,
    cols: params.terminal?.cols || 120,
    rows: params.terminal?.rows || 40,
  });
  let writable = true;
  return {
    pid: pty.pid,
    get writable() {
      return writable;
    },
    onData(callback) {
      pty.onData(callback);
    },
    onExit(callback) {
      pty.onExit((event) => {
        writable = false;
        callback(event.exitCode);
      });
    },
    onError(_callback) {
      // node-pty 将启动失败通过 spawn 抛出；运行期没有独立 error event。
    },
    async write(chars) {
      pty.write(chars);
    },
    kill(signal) {
      writable = false;
      pty.kill(signal);
    },
  };
}
