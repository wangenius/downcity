/**
 * Town TUI 视图与动作类型。
 *
 * 关键说明（中文）
 * - TUI 只负责顶层导航与状态总览。
 * - 深层 agent / plugin / city 交互继续复用现有流程，避免一次性大改。
 */

/**
 * TUI 列表项。
 */
export interface tui_list_item {
  /** 稳定主键。 */
  id: string;

  /** 左侧列表标题。 */
  title: string;

  /** 左侧列表副标题。 */
  subtitle: string;

  /** 右侧详情内容。 */
  detail: string;
}

/**
 * 顶层 TUI 动作返回值。
 */
export type tui_action_result = "refresh" | "quit";
