/**
 * Task plugin 静态导出入口。
 *
 * 关键点（中文）
 * - Index 只保留导出职责，不再承载 task plugin 的具体实现。
 * - 真正的类实现收敛到 `TaskPlugin.ts`。
 */
export { TaskPlugin } from "./TaskPlugin.js";
