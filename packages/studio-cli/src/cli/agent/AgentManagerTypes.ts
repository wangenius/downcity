/**
 * `studio agent` 交互式 manager 类型。
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
  | "configureId"
  | "configureModel"
  | "connectChannels"
  | "back";

export interface AgentManagerAgentSummary {
  id: string;
  projectRoot: string;
  status: "running" | "stopped";
  modelId?: string;
  channels: string[];
}
