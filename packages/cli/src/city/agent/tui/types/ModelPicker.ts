/**
 * Agent Chat TUI 模型选择相关类型。
 *
 * 关键点（中文）
 * - TUI 只依赖展示所需的轻量模型数据，不直接依赖 Federation 模型协议。
 * - `model_id` 是写入 Session 的稳定值，`model_name` 仅用于用户界面展示。
 */

/** Agent Chat TUI 可选择的模型。 */
export interface AgentChatModelChoice {
  /** Federation 模型目录中的稳定模型 ID。 */
  model_id: string;

  /** Federation 模型目录中的用户可读模型名称。 */
  model_name: string;

  /** 模型支持的能力列表，例如 text、stream 或 openai。 */
  modalities: string[];
}

/** 当前 Session 的模型展示信息。 */
export interface AgentChatSessionModelView {
  /** 当前 Session 保存的模型 ID；为空表示沿用 Agent 默认模型。 */
  model_id?: string;

  /** 当前模型的用户可读名称；目录无法解析时回退为模型 ID。 */
  model_name?: string;
}
