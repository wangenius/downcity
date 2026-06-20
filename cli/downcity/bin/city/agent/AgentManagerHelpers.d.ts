/**
 * `city agent` 交互式管理器辅助函数。
 *
 * 关键点（中文）
 * - 负责 Agent 列表加载、配置读取、账号绑定、prompts 与运行时操作封装。
 * - 交互式 manager 不能长期持有旧快照，启动/停止后需要重新加载摘要。
 */
import type { DowncityConfig } from "@downcity/agent";
import type { StoredChannelAccount, StoredChannelAccountChannel } from "@downcity/agent";
import type { AgentManagerAgentAction, AgentManagerConfigAction, AgentManagerListSelection, AgentManagerAgentSummary } from "../../city/agent/AgentManagerTypes.js";
type DanglingChannelAccount = {
    /**
     * 出现悬空引用的聊天渠道。
     */
    channel: StoredChannelAccountChannel;
    /**
     * agent 配置中引用但 City 全局账号池不存在的 account id。
     */
    accountId: string;
};
export declare function isInteractiveTerminal(): boolean;
export declare function loadAgentSummaries(): Promise<AgentManagerAgentSummary[]>;
/**
 * 重新加载单个 agent 摘要。
 *
 * 关键点（中文）
 * - 交互式 manager 不能长期持有旧快照，否则启动/停止后菜单状态会误导用户。
 */
export declare function reloadAgentSummary(projectRoot: string, fallback: AgentManagerAgentSummary): Promise<AgentManagerAgentSummary>;
export declare function readAgentConfig(projectRoot: string): DowncityConfig | null;
export declare function readAgentExecutionBinding(config: DowncityConfig | null): string;
export declare function readAgentChannelSummaries(config: DowncityConfig | null): string[];
export declare function findDanglingChannelAccounts(config: DowncityConfig | null): DanglingChannelAccount[];
export declare function loadChannelAccounts(channel?: StoredChannelAccountChannel): StoredChannelAccount[];
export declare function loadChannelAccountMap(): Map<string, StoredChannelAccount>;
export declare function formatAgentDetail(agent: AgentManagerAgentSummary): string;
export declare function promptAgentListSelection(): Promise<AgentManagerListSelection | null>;
export declare function promptAgentAction(agent: AgentManagerAgentSummary): Promise<AgentManagerAgentAction | null>;
export declare function formatAgentConfigPanelDescription(agent: AgentManagerAgentSummary): string;
export declare function startActionChoices(agent: AgentManagerAgentSummary): Array<{
    title: string;
    description: string;
    value: AgentManagerAgentAction;
    disabled?: boolean;
}>;
export declare function stopAndRestartActionChoices(agent: AgentManagerAgentSummary): Array<{
    title: string;
    description?: string;
    value?: AgentManagerAgentAction;
    disabled?: boolean;
}>;
export declare function promptAgentConfigAction(agent: AgentManagerAgentSummary): Promise<AgentManagerConfigAction | null>;
export declare function promptCreateProjectPath(): Promise<string | null>;
export declare function startAgentProject(projectRoot: string): Promise<void>;
export declare function runCreateFlow(): Promise<void>;
export declare function configureAgentId(agent: AgentManagerAgentSummary): Promise<AgentManagerAgentSummary>;
export declare function buildAccountTitle(account: StoredChannelAccount): string;
export declare function promptChannelAccountId(params: {
    channel: StoredChannelAccountChannel;
    currentAccountId: string;
}): Promise<string | null | undefined>;
export declare function connectAgentChannels(agent: AgentManagerAgentSummary): Promise<AgentManagerAgentSummary>;
export declare function runSelectedAgentManager(agent_input: AgentManagerAgentSummary): Promise<void>;
export {};
//# sourceMappingURL=AgentManagerHelpers.d.ts.map