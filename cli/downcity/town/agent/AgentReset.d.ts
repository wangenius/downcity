/**
 * `town agent reset`：重新配置 Agent 的执行绑定。
 *
 * 关键点（中文）
 * - 当 agent 启动失败（如 model not found）时，不必删除重建，直接重选模型。
 * - 从平台全局模型池中选择可用模型，更新 downcity.json.execution.modelId。
 * - 仅修改 execution.modelId，不触碰 PROFILE.md / SOUL.md / channels 等其他配置。
 */
/**
 * 执行 `town agent reset` 交互流程。
 */
export declare function agentResetCommand(cwd?: string): Promise<void>;
//# sourceMappingURL=AgentReset.d.ts.map