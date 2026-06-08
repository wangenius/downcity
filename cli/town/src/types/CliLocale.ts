/**
 * Town CLI 语言类型定义。
 *
 * 关键说明（中文）
 * - 统一收敛 CLI 可选语言，避免命令模块各自重复声明。
 * - 当前 Town CLI 只支持中文与英文。
 */

/**
 * Town CLI 支持的语言代码。
 */
export type CliLocale =
  /** 中文 */
  | "zh"
  /** 英文 */
  | "en";
