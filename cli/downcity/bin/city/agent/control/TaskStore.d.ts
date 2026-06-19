/**
 * Control 任务与日志数据 helper。
 *
 * 关键点（中文）
 * - 聚合 logs 与 task runs 读取逻辑。
 * - 仅负责磁盘侧读取与 control UI 视图映射。
 */
import type { ControlLogEntry, ControlTaskRunDetail, ControlTaskRunSummary } from "./types/ControlViewData.js";
export declare const TASK_RUN_DIR_REGEX: RegExp;
/**
 * 读取近期日志。
 */
export declare function readRecentLogs(params: {
    projectRoot: string;
    limit: number;
}): Promise<ControlLogEntry[]>;
/**
 * 枚举任务运行摘要。
 */
export declare function listTaskRuns(params: {
    projectRoot: string;
    title: string;
    limit: number;
}): Promise<ControlTaskRunSummary[]>;
/**
 * 读取任务运行详情。
 */
export declare function readTaskRunDetail(params: {
    projectRoot: string;
    title: string;
    timestamp: string;
}): Promise<ControlTaskRunDetail | null>;
//# sourceMappingURL=TaskStore.d.ts.map