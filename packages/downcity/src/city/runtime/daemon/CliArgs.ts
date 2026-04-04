/**
 * 负责把 commander 解析到的 options 转换成子进程 CLI 参数。
 *
 * 关键点
 * - daemon（来自 `agent start` / `agent restart`）会拉起一个前台 `agent start`
 *   进程（显式 `--foreground true`），这里负责拼装其 argv。
 */

import type { StartOptions } from "@/shared/types/Start.js";
import { allocateAvailablePort } from "@/city/runtime/daemon/PortAllocator.js";

/**
 * 将 daemon 选项转换为 `agent start` 子进程 argv。
 *
 * 关键点（中文）
 * - daemon 始终启动 `agent start` 前台流程，因此参数统一映射到 `agent start` CLI 形态。
 * - 只透传用户显式传入的字段，避免污染默认值决策。
 */
export const buildRunArgsFromOptions = async (
  projectRoot: string,
  options: StartOptions,
): Promise<string[]> => {
  // 关键点（中文）：daemon 子进程必须强制前台模式，避免再次进入 startCommand 形成递归拉起。
  const args: string[] = ["agent", "start", projectRoot, "--foreground", "true"];

  // 关键点（中文）：host 未指定时统一落到 0.0.0.0，保持历史监听行为。
  const host = String(options.host || "0.0.0.0").trim() || "0.0.0.0";

  // 关键点（中文）：agent 端口统一由 console 分配，不接受命令行显式覆盖。
  const port = await allocateAvailablePort({ host });
  if (!Number.isFinite(port) || Number.isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid allocated port: ${String(port)}`);
  }

  args.push("--port", String(port));
  args.push("--host", host);

  return args;
};
