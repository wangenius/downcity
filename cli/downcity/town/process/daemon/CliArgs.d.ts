/**
 * 负责把 commander 解析到的 options 转换成子进程 CLI 参数。
 *
 * 关键点
 * - daemon（来自 `agent start` / `agent restart`）会拉起一个前台 `agent start`
 *   进程（显式 `--foreground true`），这里负责拼装其 argv。
 * - Town 托管的 HTTP gateway 与 agent 本机 RPC 使用不同端口，避免职责混用。
 */
import type { AgentStartOptions } from "../../types/AgentStartOptions.js";
/**
 * 将 daemon 选项转换为 `agent start` 子进程 argv。
 *
 * 关键点（中文）
 * - daemon 始终启动 `agent start` 前台流程，因此参数统一映射到 `agent start` CLI 形态。
 * - 只透传用户显式传入的字段，避免污染默认值决策。
 */
export declare const buildRunArgsFromOptions: (projectRoot: string, options: AgentStartOptions) => Promise<string[]>;
//# sourceMappingURL=CliArgs.d.ts.map