/**
 * Agent 项目初始化相关类型定义。
 *
 * 关键点（中文）
 * - 统一承载 CLI 与 Console UI 共用的初始化输入/输出结构。
 * - 所有字段都面向“项目骨架创建”语义，不掺杂 runtime 状态。
 */

/**
 * 可选的 chat channel 标识。
 */
export type AgentProjectChannel = "telegram" | "feishu" | "qq";

/**
 * 初始化 agent 项目的输入参数。
 */
export interface AgentProjectInitializationInput {
  /**
   * agent 项目根目录（绝对路径或可解析相对路径）。
   */
  projectRoot: string;

  /**
   * agent 展示名。
   *
   * 关键点（中文）
   * - 为空时会自动回退到目录名推导出的默认名称。
   */
  agentName?: string;

  /**
   * 绑定到 `ship.json.model.primary` 的模型 ID。
   */
  primaryModelId: string;

  /**
   * 需要启用的 chat channels。
   *
   * 关键点（中文）
   * - 仅写入用户选择的渠道，未选择的渠道不会写入 `ship.json`。
   */
  channels?: AgentProjectChannel[];

  /**
   * 是否允许覆盖已存在的 `ship.json`。
   */
  forceOverwriteShipJson?: boolean;
}

/**
 * 初始化完成后的摘要结果。
 */
export interface AgentProjectInitializationResult {
  /**
   * 已解析后的 agent 项目根目录（绝对路径）。
   */
  projectRoot: string;

  /**
   * 最终写入的 agent 名称。
   */
  agentName: string;

  /**
   * 最终写入的主模型 ID。
   */
  primaryModelId: string;

  /**
   * 最终启用的 chat channels。
   */
  channels: AgentProjectChannel[];

  /**
   * 本次实际创建/写入的文件列表。
   */
  createdFiles: string[];

  /**
   * 因已存在而跳过的文件列表。
   */
  skippedFiles: string[];
}
