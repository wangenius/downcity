/**
 * @file 验证 daemon stop 不会因 stale PID 误杀无关进程。
 */

import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  getDaemonMetaPath,
  getDaemonPidPath,
  stopDaemonProcess,
  writeDaemonFiles,
} from "../bin/city/process/daemon/Manager.js"

test("daemon stop only cleans stale files when PID belongs to another process", async () => {
  const project_root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-daemon-identity-"))
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  })

  try {
    assert.ok(child.pid)
    await writeDaemonFiles(project_root, {
      pid: child.pid,
      instanceId: "stale-instance-id",
      projectRoot: project_root,
      startedAt: new Date().toISOString(),
      command: process.execPath,
      args: [
        path.join(project_root, "fake-cli.js"),
        "agent",
        "start",
        project_root,
        "--foreground",
        "true",
      ],
      node: process.version,
      platform: process.platform,
    })

    const result = await stopDaemonProcess({ projectRoot: project_root, timeoutMs: 50 })

    assert.deepEqual(result, { stopped: false, pid: child.pid })
    assert.doesNotThrow(() => process.kill(child.pid, 0))
    await assert.rejects(fs.stat(getDaemonPidPath(project_root)), /ENOENT/)
    await assert.rejects(fs.stat(getDaemonMetaPath(project_root)), /ENOENT/)
  } finally {
    if (child.pid) {
      try {
        process.kill(child.pid, "SIGKILL")
      } catch {
        // 子进程可能已自行退出。
      }
    }
    await fs.rm(project_root, { recursive: true, force: true })
  }
})
