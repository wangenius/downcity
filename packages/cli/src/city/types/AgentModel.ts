/**
 * Agent 模型配置相关类型。
 *
 * 关键点（中文）
 * - 类型只描述 CLI 配置操作，不复制 Federation 模型目录类型。
 * - Agent 最终只持久化选中的 model id，模型元数据始终以 Federation 为准。
 */

/**
 * `downcity agent model` 命令选项。
 */
export interface AgentModelCommandOptions {
  /**
   * 直接设置的 Federation model id。
   *
   * 未提供时进入交互式模型选择；提供后仍会向 Federation 校验可用性。
   */
  set?: string;

  /**
   * 模型更新后是否立即重启正在运行的 Agent。
   *
   * 未显式提供时，交互终端会询问，非交互终端默认不重启。
   */
  restart?: boolean;
}

/**
 * Agent 模型配置结果。
 */
export interface AgentModelConfigurationResult {
  /** Agent 项目绝对路径，也是全局 DB 中 agent_configs 的主键。 */
  project_root: string;

  /** 当前 Agent 的稳定 ID。 */
  agent_id: string;

  /** 修改前保存的 Federation model id；未配置时为空字符串。 */
  previous_model_id: string;

  /** 修改后保存的 Federation model id。 */
  current_model_id: string;

  /** 本次操作是否实际修改了全局 DB。 */
  changed: boolean;

  /** 本次操作是否重启了正在运行的 Agent。 */
  restarted: boolean;
}

/**
 * Agent 模型选择器响应。
 */
export interface AgentModelSelectionResponse {
  /** 用户选择的 Federation model id；取消选择时不存在。 */
  model_id?: string;
}

/**
 * Agent 模型更新后的重启确认响应。
 */
export interface AgentModelRestartResponse {
  /** 用户是否确认立即重启正在运行的 Agent。 */
  restart?: boolean;
}
