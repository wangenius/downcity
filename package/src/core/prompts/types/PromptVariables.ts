/**
 * Prompt 模板变量类型。
 *
 * 关键点（中文）
 * - 统一描述 `prompt.txt` 支持的运行时变量结构。
 * - 供模板渲染与地理位置解析模块复用，避免隐式约定。
 */

export interface PromptGeoContext {
  ip: string;
  location: string;
  timezone: string;
  source: "ipapi" | "ipwhois" | "local";
}

export interface PromptTemplateVariables {
  currentTime: string;
  location: string;
  projectPath: string;
  projectRoot: string;
  contextId: string;
  requestId: string;
}
