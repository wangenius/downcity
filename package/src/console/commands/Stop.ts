/**
 * 停止后台常驻的 Agent Runtime（daemon）。
 *
 * 对应用户命令：`shipmyagent agent off`
 */

import path from "path";
import { stopDaemonProcess, readDaemonPid, isProcessAlive } from "@/console/daemon/Manager.js";
import { removeConsoleAgentEntry } from "@/console/runtime/ConsoleRegistry.js";

export async function stopCommand(cwd: string = "."): Promise<void> {
  const projectRoot = path.resolve(cwd);

  const pid = await readDaemonPid(projectRoot);
  if (!pid) {
    console.log("ℹ️  No ShipMyAgent daemon is running (pid file not found)");
    // 关键点（中文）：即使 pid 文件不存在，也尽力从 console registry 移除，避免残留脏记录。
    await removeConsoleAgentEntry(projectRoot);
    return;
  }

  if (!isProcessAlive(pid)) {
    await stopDaemonProcess({ projectRoot, timeoutMs: 0 });
    console.log("ℹ️  Daemon pid file exists but process is not running; cleaned up");
    await removeConsoleAgentEntry(projectRoot);
    return;
  }

  const result = await stopDaemonProcess({ projectRoot });
  if (result.stopped) {
    console.log("✅ ShipMyAgent daemon stopped");
    console.log(`   pid: ${pid}`);
    await removeConsoleAgentEntry(projectRoot);
    return;
  }

  console.log("ℹ️  No ShipMyAgent daemon is running");
  await removeConsoleAgentEntry(projectRoot);
}
