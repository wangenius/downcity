/**
 * 负责把 commander 解析到的 options 转换成子进程 CLI 参数。
 *
 * 关键点
 * - daemon（来自 `agent on --daemon` / `agent restart`）实际启动的是内部 `run`
 *   前台逻辑，这里负责拼装其 argv。
 */

import type { StartOptions } from "@main/types/Start.js";

/**
 * 将 daemon 选项转换为 `run` 子进程 argv。
 *
 * 关键点（中文）
 * - daemon 始终启动 `run`，因此参数统一映射到 `run` 的 CLI 形态。
 * - 只透传用户显式传入的字段，避免污染默认值决策。
 */
export const buildRunArgsFromOptions = (
  projectRoot: string,
  options: StartOptions,
): string[] => {
  const args: string[] = ["run", projectRoot];

  if (options.port !== undefined) args.push("--port", String(options.port));
  if (options.host) args.push("--host", String(options.host));
  if (options.webui !== undefined)
    args.push("--webui", String(options.webui));
  if (options.webport !== undefined)
    args.push("--webport", String(options.webport));

  return args;
};
