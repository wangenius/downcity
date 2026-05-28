/**
 * Memory Plugin 导出入口。
 *
 * 关键点（中文）
 * - Index 只负责导出类实现。
 * - 真正运行时的 per-agent 实例由宿主显式创建并传给 Agent。
 */

export { MemoryPlugin } from "./MemoryPlugin.js";
