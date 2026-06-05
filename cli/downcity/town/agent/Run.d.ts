/**
 * 前台启动 Agent 进程（当前终端进程内运行）。
 *
 * 场景
 * - `town agent start --foreground` 走这里（当前终端前台运行）
 * - daemon 子进程也复用这里作为真正运行入口
 *
 * 说明
 * - 后台常驻启动请使用 `town agent start`，并用
 *   `town agent restart` 管理。
 */
import type { AgentStartOptions } from "@/types/AgentStartOptions.js";
/**
 * 前台启动入口（由 `agent start` 前台模式与内部 daemon 子进程复用）。
 *
 * 职责（中文）
 * - 初始化 agent 状态（配置、日志、services 依赖）
 * - 解析并合并启动参数（CLI > downcity.json > 默认值）
 * - 启动 agent 本机 RPC 与 Town 托管的 HTTP gateway（双端口）
 * - 启动 services（例如 task cron）
 * - 统一处理进程信号并优雅停机
 */
export declare function runCommand(cwd: string | undefined, options: AgentStartOptions): Promise<void>;
//# sourceMappingURL=Run.d.ts.map