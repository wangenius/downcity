/**
 * Agent 与 Session 模型配置相关 CLI 类型。
 *
 * 关键点（中文）
 * - Agent 默认模型持久化在全局配置 `execution.modelId`。
 * - Session 模型是运行时覆盖，只能通过运行中的 RemoteAgent 更新。
 */

/** 模型配置目标类型。 */
export type AgentModelTargetKind = "agent-default" | "session";

/** `downcity agent model` 命令选项。 */
export interface AgentModelCommandOptions {
  /** 直接设置的 Federation model id；省略时进入交互选择。 */
  set?: string;

  /** 目标 Session ID；提供时配置 Session，否则配置 Agent 默认模型。 */
  sessionId?: string;
}

/** 模型配置结果。 */
export interface AgentModelConfigurationResult {
  /** Agent 项目绝对路径。 */
  project_root: string;

  /** 目标 Agent 稳定 ID。 */
  agent_id: string;

  /** 本次配置的是 Agent 默认模型还是 Session 覆盖模型。 */
  target: AgentModelTargetKind;

  /** Session 目标的稳定 ID；配置 Agent 默认模型时不存在。 */
  session_id?: string;

  /** 修改前的 model id；未配置时为空字符串。 */
  previous_model_id: string;

  /** 修改后的 Federation model id。 */
  current_model_id: string;

  /** 本次操作是否实际修改了模型。 */
  changed: boolean;

  /** 模型配置何时生效。 */
  effective: "next-turn" | "next-start";
}

/** Federation 模型选择器响应。 */
export interface AgentModelSelectionResponse {
  /** 用户选择的 Federation model id；取消选择时不存在。 */
  model_id?: string;
}

/** 模型配置目标选择器响应。 */
export interface AgentModelTargetSelectionResponse {
  /** `agent-default` 或编码为 `session:<session-id>` 的选择值。 */
  target?: string;
}

/** 已解析的 Agent 配置目标。 */
export interface AgentModelAgentTarget {
  /** 目标 Agent 稳定 ID。 */
  agent_id: string;

  /** Agent 当前是否正在运行。 */
  status: "running" | "stopped";
}

/** 已解析的模型配置作用域。 */
export interface AgentModelResolvedTarget {
  /** 配置目标类型。 */
  kind: AgentModelTargetKind;

  /** Session 目标的稳定 ID；Agent 默认目标时不存在。 */
  session_id?: string;
}

/** Federation 模型选择流程输入。 */
export interface AgentModelResolutionInput {
  /** 当前目标的 model id，用于定位选择器默认项。 */
  current_model_id: string;

  /** 命令显式传入的 Federation model id。 */
  requested_model_id?: string;

  /** 目标 Agent 项目绝对路径。 */
  project_root: string;

  /** 当前配置目标。 */
  target: AgentModelResolvedTarget;
}
