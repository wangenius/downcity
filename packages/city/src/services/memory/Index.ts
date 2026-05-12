/**
 * Memory Service 导出入口。
 *
 * 关键点（中文）
 * - Index 只负责导出类实现。
 * - 真正运行时的 per-agent 实例由 ServiceClassRegistry 创建。
 */

export { MemoryService } from "./MemoryService.js";
