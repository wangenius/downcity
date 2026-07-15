/**
 * City Session 模型绑定类型。
 *
 * 关键点（中文）
 * - 模型 ID 属于 City 宿主编排数据，不进入 Agent SDK Session metadata。
 * - Agent 默认模型仍由 agent config 的 execution.modelId 管理；这里只保存 Session 覆盖项。
 */

/** City 持久化的 Session 模型覆盖。 */
export interface AgentSessionModelBinding {
  /** 当前 Agent 项目的绝对根目录。 */
  project_root: string;

  /** 当前 Session 的稳定标识。 */
  session_id: string;

  /** City AIService 中的稳定模型标识。 */
  model_id: string;

  /** 当前绑定最近更新时间，使用 ISO 8601 字符串。 */
  updated_at: string;
}

/** 写入 Session 模型覆盖的输入。 */
export interface UpsertAgentSessionModelBindingInput {
  /** 当前 Agent 项目的绝对根目录。 */
  project_root: string;

  /** 当前 Session 的稳定标识。 */
  session_id: string;

  /** City AIService 中的稳定模型标识。 */
  model_id: string;
}
