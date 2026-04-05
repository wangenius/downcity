/**
 * Prompt 模板变量类型。
 *
 * 关键点（中文）
 * - 统一描述 prompt template 支持的运行时变量结构。
 * - 供模板渲染与地理位置解析模块复用，避免隐式约定。
 */

export interface PromptGeoContext {
  ip: string;
  location: string;
  timezone: string;
  source: "ipapi" | "ipwhois" | "local";
}

export interface PromptVariables {
  /** 当前时间（含时区）。 */
  currentTime: string;
  /** 地理位置描述。 */
  location: string;
  /** 项目路径。 */
  projectPath: string;
  /** 项目根路径。 */
  projectRoot: string;
  /** 会话标识。 */
  sessionId: string;
}
