/**
 * 字符串模板变量类型定义。
 *
 * 职责说明（中文）
 * - 统一描述 `{{variable}}` 模板渲染时的变量映射结构。
 * - 供 init 与 runtime prompt 渲染等场景复用。
 */

export type TemplateVariableMap = Record<string, string>;
