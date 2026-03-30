/**
 * `city agent restart`：重启后台常驻的 Agent Runtime（daemon）。
 */

import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { getProfileMdPath, getDowncityJsonPath } from "@/main/env/Paths.js";
import { buildRunArgsFromOptions } from "@/main/daemon/CliArgs.js";
import { startDaemonProcess, stopDaemonProcess } from "@/main/daemon/Manager.js";
import type { StartOptions } from "@/types/Start.js";
import { ensureRuntimeModelBindingReady } from "@/main/daemon/ProjectSetup.js";

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
  // 关键点（中文）：重启前同样校验模型绑定，避免停掉旧进程后无法拉起新进程。
  ensureRuntimeModelBindingReady(projectRoot);

  // 计算当前 CLI 的入口路径（编译后是 `bin/main/commands/Index.js`）。
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
