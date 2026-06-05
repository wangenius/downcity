/**
 * `town agent` 交互式 manager 类型。
 */
export type AgentManagerRootAction = "list" | "create" | "start" | "manage" | "exit";
export type AgentManagerAgentAction = "status" | "start" | "stop" | "restart" | "chat" | "configureId" | "connectChatAccounts" | "back";
export interface AgentManagerAgentSummary {
    id: string;
    projectRoot: string;
    status: "running" | "stopped";
    execution_binding?: string;
    channels: string[];
}
//# sourceMappingURL=AgentManagerTypes.d.ts.map