/**
 * agent 选择与列表展示类型定义。
 */

export type CliRegisteredAgentView = {
  name: string;
  projectRoot: string;
  status: "running" | "stopped";
};

export type CliAgentPromptChoice = {
  title: string;
  value: string;
  description: string;
};

export type ResolveCliAgentStartTargetDecisionInput = {
  pathInput?: string;
  currentWorkingDirectory: string;
  currentDirectoryInitialized: boolean;
  interactive: boolean;
  registeredAgents: CliRegisteredAgentView[];
};

export type ResolveCliAgentStartTargetDecision =
  | {
      mode: "explicit" | "current";
      projectRoot: string;
    }
  | {
      mode: "prompt";
    }
  | {
      mode: "error";
      reason: "no-registered-agents" | "non-interactive";
    };
