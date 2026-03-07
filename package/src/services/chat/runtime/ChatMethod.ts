/**
 * ChatMethod：chat 投递方式解析器。
 *
 * 关键点（中文）
 * - 统一解析 `services.chat.method`，避免各模块重复写默认值逻辑。
 * - 未配置或非法值统一回退到 `direct`，保证默认直发与行为稳定。
 */

import type { ShipConfig } from "@main/types/ShipConfig.js";

export type ChatMethod = "cmd" | "direct";

/**
 * 解析当前生效的 chat 投递方式。
 */
export function resolveChatMethod(config: ShipConfig | null | undefined): ChatMethod {
  const method = String(config?.services?.chat?.method || "")
    .trim()
    .toLowerCase();
  if (method === "cmd") return "cmd";
  return "direct";
}
