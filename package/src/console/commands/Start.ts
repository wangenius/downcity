/**
 * 后台常驻启动（daemon）。
 *
 * 对应用户命令：`sma agent on`
 *
 * 行为
 * - 在 `.ship/debug/` 写入 pid/log/meta 文件
 * - 通过 `node <commands/index.js> agent on ...` 启动真正的前台逻辑，但以 detached 方式在后台运行
 *
 * 注意
 * - 前台启动请显式使用 `sma agent on --foreground`。
 */

import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { getProfileMdPath, getShipJsonPath } from "@/console/env/Paths.js";
import { startDaemonProcess } from "@/console/daemon/Manager.js";
import { buildRunArgsFromOptions } from "@/console/daemon/CliArgs.js";
import type { StartOptions } from "@agent/types/Start.js";
import { isConsoleRunning } from "@/console/runtime/ConsoleRuntime.js";

/**
 * daemon 启动入口。
 *
 * 流程（中文）
 * 1) 校验项目初始化文件是否存在
 * 2) 组装 `agent on` 子进程参数
 * 3) 通过 daemon manager 后台拉起并打印 pid/log
 */
export async function startCommand(
  cwd: string = ".",
  options: StartOptions,
): Promise<void> {
  const projectRoot = path.resolve(cwd);

  // 关键点（中文）：console 必须先启动，agent daemon 才“有效”。
  if (!(await isConsoleRunning())) {
    console.error("❌ console is not running. Please run `sma console start` first.");
    process.exit(1);
  }

  // 启动前先做最基本的工程校验，避免起了一个立刻报错退出的 daemon。
  if (!fs.existsSync(getProfileMdPath(projectRoot))) {
    console.error(
      '❌ Project not initialized. Please run "sma agent create" first',
    );
    process.exit(1);
  }
  if (!fs.existsSync(getShipJsonPath(projectRoot))) {
    console.error(
      '❌ ship.json does not exist. Please run "sma agent create" first',
    );
    process.exit(1);
  }

  // 计算当前 CLI 的入口路径（编译后是 `bin/console/commands/Index.js`）。
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cliPath = path.resolve(__dirname, "./Index.js");

  const args = await buildRunArgsFromOptions(projectRoot, options || {});

  try {
    const { pid, logPath } = await startDaemonProcess({
      projectRoot,
      cliPath,
      args,
    });

    console.log("✅ ShipMyAgent daemon started");
    console.log(`   pid: ${pid}`);
    console.log(`   log: ${logPath}`);
  } catch (error) {
    console.error("❌ Failed to start daemon:", error);
    process.exit(1);
  }
}
