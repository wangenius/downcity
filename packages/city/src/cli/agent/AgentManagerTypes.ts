/**
 * `city agent` 交互式 manager 类型。
 */

export type AgentManagerRootAction =
  | "list"
  | "create"
  | "start"
  | "manage"
  | "exit";

export type AgentManagerAgentAction =
  | "status"
  | "start"
  | "stop"
  | "restart"
  | "chat"
  | "configureName"
  | "configureModel"
  | "connectChannels"
  | "back";

export interface AgentManagerAgentSummary {
  name: string;
  projectRoot: string;
  status: "running" | "stopped";
  modelId?: string;
  channels: string[];
}
