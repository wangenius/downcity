/**
 * AgentHistory：`city agent history` 维护命令。
 *
 * 关键点（中文）
 * - 面向用户提供定点硬清理能力，用于处理单个坏 session。
 * - 清理范围固定为 session messages、chat audit、channel route 三处。
 * - 命令必须显式传 `--hard`，避免误删运行时历史。
 */
import type { AgentHistoryCleanOptions, AgentHistoryCleanResult } from "./AgentHistoryTypes.js";
/**
 * 执行 `city agent history clean`。
 */
export declare function agentHistoryCleanCommand(projectRoot: string, options: AgentHistoryCleanOptions): Promise<AgentHistoryCleanResult>;
//# sourceMappingURL=AgentHistory.d.ts.map