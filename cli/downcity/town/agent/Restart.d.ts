/**
 * `town agent restart`：重启后台常驻的 Agent 进程（daemon）。
 *
 * 关键点（中文）
 * - 这是 `start` / `stop` 之间的组合命令，不直接复用 shell 层面的进程替换。
 * - 重启前必须重新校验项目初始化状态与 execution binding，避免先停后起失败。
 * - 成功后会重新生成 daemon 元信息与日志路径，确保运行态与当前配置一致。
 */
import type { AgentStartOptions } from "@/types/AgentStartOptions.js";
/**
 * restart 命令执行流程。
 *
 * 关键点（中文）
 * 1) 统一预检（项目初始化 + binding）
 * 2) 停止旧 daemon
 * 3) 按当前参数重建启动参数并拉起新 daemon
 */
export declare function restartCommand(cwd: string | undefined, options: AgentStartOptions): Promise<void>;
//# sourceMappingURL=Restart.d.ts.map