/**
 * agent 列表与交互式选择辅助模块。
 *
 * 关键点（中文）
 * - 统一承接 `city agent list` 的 registry 展示逻辑。
 * - 统一承接 `city agent start` 在省略路径时的目标选择逻辑。
 * - 规则固定为：显式路径优先，其次当前目录已初始化，最后才进入交互选择。
 */
import type { CliAgentPromptChoice, CliRegisteredAgentView, ResolveCliAgentStartTargetDecision, ResolveCliAgentStartTargetDecisionInput } from "../../city/agent/AgentSelectionTypes.js";
/**
 * 读取当前 registry 中的已登记 agent 列表。
 */
export declare function listRegisteredAgentsForCli(): Promise<CliRegisteredAgentView[]>;
/**
 * 构建交互式选择器的 choices。
 */
export declare function buildCliAgentPromptChoices(agents: CliRegisteredAgentView[]): CliAgentPromptChoice[];
/**
 * 解析 `agent start` 在当前上下文下应该如何决定目标目录。
 */
export declare function resolveCliAgentStartTargetDecision(input: ResolveCliAgentStartTargetDecisionInput): ResolveCliAgentStartTargetDecision;
/**
 * 输出已登记 agent 列表。
 */
export declare function emitRegisteredAgentList(): Promise<void>;
/**
 * 输出已登记 agent 列表，可选仅显示运行中项目。
 */
export declare function emitRegisteredAgentListWithOptions(options?: {
    /**
     * 是否只输出当前运行中的 agent。
     */
    runningOnly?: boolean;
    /**
     * 是否以 JSON 输出。
     */
    asJson?: boolean;
}): Promise<void>;
/**
 * 为 `city agent start` 解析最终要启动的项目目录。
 */
export declare function resolveCliAgentStartProjectRoot(pathInput?: string): Promise<string>;
//# sourceMappingURL=AgentSelection.d.ts.map