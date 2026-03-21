/**
 * 渠道展示文案工具。
 *
 * 关键点（中文）
 * - 统一 Console UI 中各处的渠道名称展示，避免同一渠道出现不同标注。
 * - QQ 当前处于 dev 阶段，所有用户可见入口都应明确标注。
 */

/**
 * 返回渠道展示名。
 */
export function getChannelDisplayName(channelInput: string): string {
  const channel = String(channelInput || "").trim().toLowerCase()
  if (channel === "telegram") return "Telegram"
  if (channel === "feishu") return "Feishu"
  if (channel === "qq") return "QQ (dev)"
  if (channel === "consoleui") return "Console UI"
  return channel || "-"
}
