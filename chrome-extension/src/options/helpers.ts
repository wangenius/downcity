/**
 * Options 页面纯工具函数。
 *
 * 关键点（中文）：
 * - 集中管理 Options 状态文案与基础解析逻辑。
 * - 让设置页组件更聚焦在数据流与交互。
 */

/**
 * Options 状态。
 */
export interface OptionsStatus {
  /**
   * 当前状态类型。
   */
  type: "idle" | "success" | "error" | "loading";
  /**
   * 当前状态文案。
   */
  text: string;
}

/**
 * 读取错误文本。
 */
export function readErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "未知错误");
}

/**
 * 获取状态颜色类名。
 */
export function getStatusClass(type: OptionsStatus["type"]): string {
  if (type === "success") return "text-[#166534]";
  if (type === "error") return "text-[#7f1d1d]";
  if (type === "loading") return "text-[#9a6700]";
  return "text-muted-foreground";
}
