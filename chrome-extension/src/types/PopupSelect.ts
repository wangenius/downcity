/**
 * Popup 自定义下拉选择器类型。
 *
 * 关键点（中文）：
 * - 统一 popup 中 Agent / Chat / Ask 历史的选择项结构。
 * - 避免在 UI 组件里散落匿名对象，降低后续重构成本。
 */

/**
 * 自定义下拉项。
 */
export interface PopupSelectOption {
  /**
   * 选项唯一值。
   */
  value: string;

  /**
   * 主显示文案。
   */
  label: string;

  /**
   * 辅助说明文案。
   */
  description?: string;

  /**
   * 当前项是否禁用。
   */
  disabled?: boolean;
}
