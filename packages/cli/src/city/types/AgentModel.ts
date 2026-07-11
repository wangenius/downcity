/**
 * Session 模型配置相关 CLI 类型。
 *
 * 关键点（中文）
 * - 模型目录来自 Federation，当前选择归属于目标 Session。
 * - CLI 只通过 RemoteAgent 更新运行中的 Session，不修改 Agent 默认配置。
 */

import type { RemoteAgent } from "@downcity/agent";

/** `downcity agent model` 命令选项。 */
export interface AgentModelCommandOptions {
  /** 直接设置的 Federation model id；省略时进入交互选择。 */
  set?: string;

  /** 目标 Session ID；省略时在交互终端选择。 */
  sessionId?: string;
}

/** Session 模型配置结果。 */
export interface AgentModelConfigurationResult {
  /** Agent 项目绝对路径。 */
  project_root: string;

  /** 目标 Agent 稳定 ID。 */
  agent_id: string;

  /** 目标 Session 稳定 ID。 */
  session_id: string;

  /** 修改前的 Session model id；未配置时为空字符串。 */
  previous_model_id: string;

  /** 修改后的 Session model id。 */
  current_model_id: string;

  /** 本次操作是否实际切换了 Session 模型。 */
  changed: boolean;
}

/** Federation 模型选择器响应。 */
export interface AgentModelSelectionResponse {
  /** 用户选择的 Federation model id；取消选择时不存在。 */
  model_id?: string;
}

/** Session 选择器响应。 */
export interface AgentModelSessionSelectionResponse {
  /** 用户选择的 Session ID；取消选择时不存在。 */
  session_id?: string;
}

/** 已解析的运行中 Agent 目标。 */
export interface AgentModelRunningTarget {
  /** 目标 Agent 稳定 ID。 */
  agent_id: string;
}

/** Session 选择流程输入。 */
export interface AgentModelSessionResolutionInput {
  /** 已连接到目标 daemon 的 RemoteAgent。 */
  remote_agent: RemoteAgent;

  /** 命令显式传入的 Session ID。 */
  requested_session_id?: string;

  /** 目标 Agent 项目绝对路径。 */
  project_root: string;
}

/** Federation 模型选择流程输入。 */
export interface AgentModelResolutionInput {
  /** 当前 Session model id，用于定位选择器默认项。 */
  current_model_id: string;

  /** 命令显式传入的 Federation model id。 */
  requested_model_id?: string;

  /** 目标 Agent 项目绝对路径。 */
  project_root: string;

  /** 目标 Session 稳定 ID。 */
  session_id: string;
}
