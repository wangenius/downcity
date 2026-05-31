/**
 * Console Dashboard 写操作聚合入口。
 *
 * 关键点（中文）
 * - 对外保持 `../lib/dashboard-mutations` 导入路径不变。
 * - 具体 mutation 按 service/plugin、agent/resource、task 三类拆分维护。
 */

export * from "./dashboard-mutations/ServicePluginMutations";
export * from "./dashboard-mutations/AgentResourceMutations";
export * from "./dashboard-mutations/TaskMutations";
