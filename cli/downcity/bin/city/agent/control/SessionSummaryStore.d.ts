/**
 * Control 会话摘要读取 helper。
 *
 * 关键点（中文）
 * - 负责会话列表聚合。
 * - 只返回控制面视图需要的摘要字段。
 */
import type { ControlSessionSummary } from "./types/ControlViewData.js";
/**
 * 枚举控制面所需的 session 摘要。
 */
export declare function listControlSessionSummaries(params: {
    projectRoot: string;
    agentId: string;
    limit: number;
    executingSessionIds?: Set<string>;
}): Promise<ControlSessionSummary[]>;
//# sourceMappingURL=SessionSummaryStore.d.ts.map