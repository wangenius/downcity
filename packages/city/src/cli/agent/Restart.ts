/**
 * `city agent restart`：重启后台常驻的 Agent 进程（daemon）。
 *
 * 关键点（中文）
 * - 这是 `start` / `stop` 之间的组合命令，不直接复用 shell 层面的进程替换。
 * - 重启前必须重新校验项目初始化状态与 execution binding，避免先停后起失败。
 * - 成功后会重新生成 daemon 元信息与日志路径，确保运行态与当前配置一致。
 */

import path from "path";
import { fileURLToPath } from "url";
import { buildRunArgsFromOptions } from "@/process/daemon/CliArgs.js";
import { startDaemonProcess, stopDaemonProcess } from "@/process/daemon/Manager.js";
import type { StartOptions } from "@downcity/agent";
import { emitCliBlock } from "../shared/CliReporter.js";
import { resolveAgentName } from "../shared/IndexSupport.js";
import { checkAgentPreflight } from "../service/ServiceCommandSupport.js";
import { CliError } from "../shared/CliError.js";

/**
 * restart 命令执行流程。
 *
 * 关键点（中文）
 * 1) 统一预检（项目初始化 + binding）
 * 2) 停止旧 daemon
 * 3) 按当前参数重建启动参数并拉起新 daemon
 */
export async function restartCommand(
  cwd: string = ".",
  options: StartOptions,
): Promise<void> {
  const projectRoot = path.resolve(cwd);

  // 关键点（中文）：统一预检（restart 不强制要求 city runtime running，因为 stop 后可能已停）。
  await checkAgentPreflight(projectRoot, { requireCityRunning: false });

  // 计算当前 CLI 的入口路径（编译后是 `bin/main/modules/cli/Index.js`）。
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cliPath = path.resolve(__dirname, "../Index.js");

  try {
    await stopDaemonProcess({ projectRoot });
    const args = await buildRunArgsFromOptions(projectRoot, options || {});
    await startDaemonProcess({
      projectRoot,
      cliPath,
      args,
    });

    emitCliBlock({
      tone: "success",
      title: "Agent daemon restarted",
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
      title: "Failed to restart daemon",
      note: error instanceof Error ? error.message : String(error),
    });
  }
}
