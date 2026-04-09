/**
 * 通用配置编辑器字段类型定义。
 *
 * 关键点（中文）
 * - 用于 Console UI 中各类“配置表单”统一描述字段结构。
 * - 让 channel account / plugin config / provider config 等都能复用同一套渲染逻辑。
 * - 这里只描述 UI 编辑层字段，不承载后端协议语义。
 */

/**
 * 通用配置字段类型。
 */
export type UiConfigEditorFieldType =
  /**
   * 普通文本输入。
   */
  | "string"
  /**
   * 数字输入。
   */
  | "number"
  /**
   * 敏感文本输入（密码/密钥）。
   */
  | "secret"
  /**
   * 布尔选择。
   */
  | "boolean"
  /**
   * 枚举选择。
   */
  | "select"

/**
 * 通用配置字段选项。
 */
export interface UiConfigEditorFieldOption {
  /**
   * 选项稳定值。
   */
  value: string
  /**
   * 选项展示标签。
   */
  label: string
  /**
   * 选项补充说明。
   */
  description?: string
}

/**
 * 通用配置字段描述。
 */
export interface UiConfigEditorField {
  /**
   * 字段稳定 key。
   */
  key: string
  /**
   * 字段展示标签。
   */
  label: string
  /**
   * 字段类型。
   */
  type: UiConfigEditorFieldType
  /**
   * 字段占位文案。
   */
  placeholder?: string
  /**
   * 字段说明文案。
   */
  description?: string
  /**
   * 字段是否必填。
   */
  required?: boolean
  /**
   * 字段是否禁用。
   */
  disabled?: boolean
  /**
   * 布尔字段为 true 时的标签。
   */
  trueLabel?: string
  /**
   * 布尔字段为 false 时的标签。
   */
  falseLabel?: string
  /**
   * 枚举字段的候选选项。
   */
  options?: UiConfigEditorFieldOption[]
}
