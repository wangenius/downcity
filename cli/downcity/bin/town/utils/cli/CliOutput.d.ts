/**
 * CLI 输出工具（统一出口）。
 *
 * 关键点（中文）
 * - 所有命令通过 printResult 输出，不再直接调用 emitCliBlock / emitCliList / console.log。
 * - asJson=true → 结构化 JSON（脚本友好）；asJson=false → 委托 CliReporter 渲染人类可读文本。
 * - 支持三种输出类型：block（单段落）、list（列表分组）、payload（旧版键值对，兼容过渡）。
 */
import type { CliReportFact, CliReportListItem, CliReportTone } from "../../../shared/CliReporterTypes.js";
/**
 * printResult 统一参数。
 *
 * 说明（中文）
 * - type 未传时走 payload 模式（key-value → block 转换，兼容旧调用方）。
 * - type="block" 时直接按 CliReportBlock 渲染。
 * - type="list" 时直接按 CliReportList 渲染。
 */
export type PrintResultParams = {
    /** 是否以 JSON 格式输出（默认 true，保持历史行为）。 */
    asJson?: boolean;
    /** 当前操作是否成功（影响 JSON 的 success 字段和色调默认值）。 */
    success: boolean;
    /** 输出标题（JSON 中作为 title，人类可读中作为 heading）。 */
    title: string;
    /** 输出类型。 */
    type?: "block" | "list";
    /** 视觉语气。 */
    tone?: CliReportTone;
    /** 标题右侧补充摘要。 */
    summary?: string;
    /** 详情键值对。 */
    facts?: CliReportFact[];
    /** 附注文本。 */
    note?: string;
    /** 列表项。 */
    items?: CliReportListItem[];
    /** 键值对 payload。 */
    payload?: Record<string, unknown>;
};
/**
 * 统一 CLI 输出入口。
 *
 * 行为（中文）
 * - asJson=true：输出 `{ success, data?: {...}, error?: string }` 到 stdout。
 * - asJson=false：
 *   - type="block" → emitCliBlock
 *   - type="list" → emitCliList
 *   - 未传 type → 将 payload 转为 facts 后 emitCliBlock
 */
export declare function printResult(params: PrintResultParams): void;
//# sourceMappingURL=CliOutput.d.ts.map