/**
 * 查询后台 Agent 进程（daemon）状态。
 *
 * 对应命令：
 * - `town agent status [path]`
 */
/**
 * daemon 状态查询入口。
 *
 * 状态规则（中文）
 * - 运行中：输出 pid / log / startedAt
 * - 已初始化但未运行：输出 not running
 * - 未初始化：提示执行 `town agent create`
 */
export declare function statusCommand(cwd?: string): Promise<void>;
//# sourceMappingURL=Status.d.ts.map