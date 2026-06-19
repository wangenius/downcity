/**
 * CLI Reporter：统一渲染 city 命令行输出。
 *
 * 关键点（中文）
 * - 为 lifecycle 类命令提供稳定、统一、层级清晰的文本版式。
 * - 将颜色、符号、对齐规则集中在这里，避免命令文件继续散落 `console.log` 模板串。
 * - 保持纯函数输出，方便测试并保证非 TTY 场景仍可读。
 */
import type { CliRenderOptions, CliReportBlock, CliReportList } from "./types/CliReporter.js";
/**
 * 设置全局 verbosity 级别。
 *
 * 关键点（中文）
 * - 由 CLI 入口在 parse 前调用。
 * - quiet 模式下 suppress 所有非 error 的 emitCliBlock/emitCliList。
 */
export declare function setCliVerbosity(level: "quiet" | "normal" | "verbose"): void;
/**
 * 渲染单个信息区块（纯文本，不输出到 stdout）。
 */
export declare function formatCliBlock(block: CliReportBlock, options?: CliRenderOptions): string;
/**
 * 渲染列表分组（纯文本）。
 */
export declare function formatCliList(list: CliReportList, options?: CliRenderOptions): string;
/**
 * 渲染命令顶部 banner（纯文本）。
 */
export declare function formatCliHeader(version: string, options?: CliRenderOptions): string;
/**
 * 重置当前命令的输出分组节奏。
 *
 * 关键点（中文）
 * - 每次新的 CLI 命令开始输出前都应先重置。
 * - 这样不同命令之间不会串联复用上一条命令的留白状态。
 */
export declare function resetCliSectionFlow(): void;
/**
 * 输出 header section。
 */
export declare function emitCliHeader(version: string, options?: CliRenderOptions): void;
/**
 * 输出 block section。
 */
export declare function emitCliBlock(block: CliReportBlock, options?: CliRenderOptions): void;
/**
 * 输出 list section。
 */
export declare function emitCliList(list: CliReportList, options?: CliRenderOptions): void;
//# sourceMappingURL=CliReporter.d.ts.map