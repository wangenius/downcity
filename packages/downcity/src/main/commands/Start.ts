/**
 * 后台常驻启动（daemon）。
 *
 * 对应用户命令：`city agent start`
 *
 * 行为
 * - 在 `.downcity/debug/` 写入 pid/log/meta 文件
 * - 通过 `node <commands/index.js> agent start ...` 启动真正的前台逻辑，但以 detached 方式在后台运行
 *
 * 注意
 * - 前台启动请显式使用 `city agent start --foreground`。
 */

import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { getProfileMdPath, getDowncityJsonPath } from "@/main/env/Paths.js";
import { startDaemonProcess } from "@/main/daemon/Manager.js";
import { buildRunArgsFromOptions } from "@/main/daemon/CliArgs.js";
import type { StartOptions } from "@/types/Start.js";
import { isConsoleRunning } from "@/main/runtime/ConsoleRuntime.js";
import { ensureRuntimeExecutionBindingReady } from "@/main/daemon/ProjectSetup.js";

/**
 * daemon 启动入口。
 *
 * 流程（中文）
 * 1) 校验项目初始化文件是否存在
 * 2) 组装 `agent start` 子进程参数
 * 3) 通过 daemon manager 后台拉起并打印 pid/log
 */
export async function startCommand(
  cwd: string = ".",
  options: StartOptions,
): Promise<void> {
  const projectRoot = path.resolve(cwd);

  // 关键点（中文）：console 必须先启动，agent daemon 才“有效”。
  if (!(await isConsoleRunning())) {
    console.error("❌ console is not running. Please run `city console start` first.");
    process.exit(1);
  }

  // 启动前先做最基本的工程校验，避免起了一个立刻报错退出的 daemon。
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
  // 关键点（中文）：后台拉起前先校验 execution binding 是否可用，避免“启动成功后秒退”。
  ensureRuntimeExecutionBindingReady(projectRoot);

  // 计算当前 CLI 的入口路径（编译后是 `bin/main/commands/Index.js`）。
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

    console.log("✅ Downcity daemon started");
    console.log(`   pid: ${pid}`);
    console.log(`   log: ${logPath}`);
  } catch (error) {
    console.error("❌ Failed to start daemon:", error);
    process.exit(1);
  }
}
