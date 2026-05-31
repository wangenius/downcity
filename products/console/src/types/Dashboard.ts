/**
 * Console UI Dashboard 类型聚合入口。
 *
 * 关键点（中文）
 * - 对外仍保持 `../types/Dashboard` 的导入路径。
 * - 具体类型按 Agent、Overview、Authorization、Plugin、Runtime、Task、Session/Model 拆分。
 */

export * from "./dashboard/AgentTypes";
export * from "./dashboard/OverviewTypes";
export * from "./dashboard/AuthorizationTypes";
export * from "./dashboard/PluginTypes";
export * from "./dashboard/RuntimeTypes";
export * from "./dashboard/TaskTypes";
export * from "./dashboard/SessionAndModelTypes";
