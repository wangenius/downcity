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
import { fileURLToPath } from "url";
import { startDaemonProcess } from "@/daemon/Manager.js";
import { buildRunArgsFromOptions } from "@/daemon/CliArgs.js";
import type { StartOptions } from "@/shared/types/Start.js";
import { emitCliBlock } from "./CliReporter.js";
import { resolveAgentName } from "./IndexSupport.js";
import { checkAgentPreflight } from "./ServiceCommandSupport.js";
import { CliError } from "@/types/cli/CliError.js";

/**
 * daemon 启动入口。
 *
 * 流程（中文）
 * 1) 统一预检（city runtime + 项目初始化 + binding）
 * 2) 组装 `agent start` 子进程参数
 * 3) 通过 daemon manager 后台拉起并打印 pid/log
 */
export async function startCommand(
  cwd: string = ".",
  options: StartOptions,
): Promise<void> {
  const projectRoot = path.resolve(cwd);

  // 关键点（中文）：统一预检，替代分散的内联校验。
  await checkAgentPreflight(projectRoot);

  // 计算当前 CLI 的入口路径（编译后是 `bin/main/modules/cli/Index.js`）。
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cliPath = path.resolve(__dirname, "./Index.js");

  const args = await buildRunArgsFromOptions(projectRoot, options || {});

  try {
    const { logPath: _logPath } = await startDaemonProcess({
      projectRoot,
      cliPath,
      args,
    });

    emitCliBlock({
      tone: "success",
      title: "Agent daemon started",
      summary: resolveAgentName(projectRoot),
      facts: [
        {
          label: "Project",
          value: projectRoot,
        },
      ],
    });
  } catch (error) {
    throw new CliError({
      title: "Failed to start daemon",
      note: error instanceof Error ? error.message : String(error),
    });
  }
}
