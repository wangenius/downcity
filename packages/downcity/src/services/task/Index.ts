/**
 * Task service 静态导出入口。
 *
 * 关键点（中文）
 * - Index 只保留导出职责，不再承载 task service 的具体实现。
 * - 真正的类实现收敛到 `TaskService.ts`。
 */

export { TaskService, taskService } from "./TaskService.js";
