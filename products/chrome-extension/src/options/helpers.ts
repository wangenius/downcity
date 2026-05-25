/**
 * Options 页面纯工具函数。
 *
 * 关键点（中文）：
 * - 集中管理 Options 状态文案与基础解析逻辑。
 * - 让设置页组件更聚焦在数据流与交互。
 */

import { decorateAuthErrorText } from "../services/auth";

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
  const decorated =
    error instanceof Error
      ? decorateAuthErrorText(error.message)
      : decorateAuthErrorText(error || "未知错误");
  if (/failed to fetch/i.test(decorated)) {
    return "无法连接到 Server，请确认服务可访问，并检查当前连接的 Protocol / Host / Port / Base Path 配置。";
  }
  return decorated;
}

/**
 * 获取状态颜色类名。
 */
export function getStatusClass(type: OptionsStatus["type"]): string {
  if (type === "success") return "text-success";
  if (type === "error") return "text-error";
  if (type === "loading") return "text-warning";
  return "text-muted-foreground";
}
