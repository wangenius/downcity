/**
 * AcpVisibleText：ACP 可见回复契约与文本收敛工具。
 *
 * 关键点（中文）
 * - ACP adapter 可能把过程性内容错误发成 `agent_message_chunk`。
 * - Downcity 通过专用 final 标签要求 agent 明确标注最终可见回复。
 * - 一旦输出包含 final 标签，只落盘/回发标签内部文本，标签外内容一律视为过程噪音。
 */

export const DOWNCITY_ACP_FINAL_OPEN_TAG = "<downcity_final>";
export const DOWNCITY_ACP_FINAL_CLOSE_TAG = "</downcity_final>";

/**
 * 构建注入给 ACP agent 的输出契约。
 */
export function buildAcpVisibleOutputContract(): string {
  return [
    "## Downcity ACP Output Contract",
    "你必须只把最终可见回复写在 `<downcity_final>...</downcity_final>` 标签内。",
    "标签内只能写要发给用户的最终文本，不要写推理过程、计划、命令尝试、工具调用说明或自我检查。",
    "标签外内容会被 Downcity 视为内部过程并丢弃，不会写入 assistant 历史，也不会发送给用户。",
    "示例：",
    `${DOWNCITY_ACP_FINAL_OPEN_TAG}已完成。${DOWNCITY_ACP_FINAL_CLOSE_TAG}`,
  ].join("\n");
}

/**
 * 从 ACP 原始文本中提取用户可见最终回复。
 */
export function extractAcpVisibleText(rawText: string): string {
  const source = String(rawText || "");
  const matches = Array.from(
    source.matchAll(/<downcity_final>([\s\S]*?)<\/downcity_final>/gi),
  );
  if (matches.length === 0) return source.trim();
  const latest = matches[matches.length - 1];
  return String(latest?.[1] || "").trim();
}

/**
 * 判断当前 ACP 文本是否已经包含完整 final 标签。
 */
export function hasAcpVisibleTextTag(rawText: string): boolean {
  return /<downcity_final>[\s\S]*?<\/downcity_final>/i.test(String(rawText || ""));
}
