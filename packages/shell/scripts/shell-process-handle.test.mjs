/**
 * @file Shell pipe 进程句柄终态事件回归测试。
 *
 * 关键点（中文）
 * - 短命令可能在 Shell runtime 注册 onExit 前已经退出。
 * - process handle 必须缓存并重放终态，不能让 one-shot exec 永久停留在 running。
 */

import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import test from "node:test";

import { createPipeProcessHandle } from "../bin/sandbox/ShellProcessHandle.js";

test("pipe handle 向后注册的 onExit 重放已发生的 close", async () => {
  const child = spawn(process.execPath, ["-e", "process.exit(7)"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const handle = createPipeProcessHandle(child);

  await once(child, "close");

  const exit_code = await new Promise((resolve) => {
    handle.onExit(resolve);
  });
  assert.equal(exit_code, 7);
});
