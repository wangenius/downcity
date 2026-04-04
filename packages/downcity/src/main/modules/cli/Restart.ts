/**
 * `city agent restart`：重启后台常驻的 Agent 进程（daemon）。
 *
 * 关键点（中文）
 * - 这是 `start` / `stop` 之间的组合命令，不直接复用 shell 层面的进程替换。
 * - 重启前必须重新校验项目初始化状态与 execution binding，避免先停后起失败。
 * - 成功后会重新生成 daemon 元信息与日志路径，确保运行态与当前配置一致。
 */

import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { getProfileMdPath, getDowncityJsonPath } from "@/main/city/env/Paths.js";
import { buildRunArgsFromOptions } from "@/main/city/daemon/CliArgs.js";
import { startDaemonProcess, stopDaemonProcess } from "@/main/city/daemon/Manager.js";
import type { StartOptions } from "@/shared/types/Start.js";
import { ensureRuntimeExecutionBindingReady } from "@/main/city/daemon/ProjectSetup.js";

/**
 * restart 命令执行流程。
 *
 * 关键点（中文）
 * 1) 校验项目初始化状态
 * 2) 停止旧 daemon
 * 3) 按当前参数重建启动参数并拉起新 daemon
 */
export async function restartCommand(
  cwd: string = ".",
  options: StartOptions,
): Promise<void> {
  const projectRoot = path.resolve(cwd);

  if (!fs.existsSync(getProfileMdPath(projectRoot))) {
    console.error(
      '❌ Project not initialized. Please run "city agent create" first',
    );
    process.exit(1);
  }
  if (!fs.existsSync(getDowncityJsonPath(projectRoot))) {
    console.error(
      '❌ downcity.json does not exist. Please run "city agent create" first',
    );
    process.exit(1);
  }
  // 关键点（中文）：重启前同样校验 execution binding，避免停掉旧进程后无法拉起新进程。
  ensureRuntimeExecutionBindingReady(projectRoot);

  // 计算当前 CLI 的入口路径（编译后是 `bin/main/modules/cli/Index.js`）。
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cliPath = path.resolve(__dirname, "./Index.js");

  try {
    await stopDaemonProcess({ projectRoot });
    const args = await buildRunArgsFromOptions(projectRoot, options || {});
    const { pid, logPath } = await startDaemonProcess({
      projectRoot,
      cliPath,
      args,
    });

    console.log("✅ Downcity daemon restarted");
    console.log(`   pid: ${pid}`);
    console.log(`   log: ${logPath}`);
  } catch (error) {
    console.error("❌ Failed to restart daemon:", error);
    process.exit(1);
  }
}
