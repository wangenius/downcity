/**
 * 从 assistant message 中提取“用户可见文本”。
 *
 * 背景（中文，关键点）
 * - 在 tool-strict 模式下，模型的 `result.text` 可能为空
 * - 真实的“最终回复”往往由 `chat_send` 工具的 input.text 决定
 * - 因此需要一个稳定的、与 Agent 解耦的提取逻辑（属于 chat/egress 语义）
 */

import type { SessionMessageV1 } from "@/types/SessionMessage.js";
import {
  extractTextFromUiMessage,
  extractToolCallsFromUiMessage,
} from "./UIMessageTransformer.js";

/**
 * 判断 assistant message 是否声明“本轮 step 消息已单独持久化”。
 *
 * 关键点（中文）
 * - 该标记只用于避免在 run 结束时把最终 merged assistant 再重复写入 context。
 * - 不影响 channel 发送；只影响 context messages 的最终 append 策略。
 */
export function hasPersistedAssistantSteps(
  message: SessionMessageV1 | null | undefined,
): boolean {
  const extra = message?.metadata?.extra;
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return false;
  return extra.assistantStepMessagesPersisted === true;
}

/**
 * 提取策略（中文）
 * - 倒序扫描：优先使用最后一次 `chat_send`，与最终用户感知一致。
 * - 优先使用 chat_send 的 input.text（需结合 tool output 判断成功）。
 * - 若 tool output 为空/非 JSON，走 best-effort 采用 input.text。
 * - 若无 tool call，则回退到 message 文本内容。
 */
export function pickLastSuccessfulChatSendText(
  message: SessionMessageV1 | null | undefined,
): string {
  const toolCalls = extractToolCallsFromUiMessage(message);
  // 关键点（中文）：优先从 chat_send 的 input.text 还原"用户可见回复"。
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const tc = toolCalls[i];
    if (!tc) continue;
    if (String(tc.tool || "") !== "chat_send") continue;

    const inputText = tc.input ? tc.input.text : undefined;
    const text = (typeof inputText === "string" ? inputText : "").trim();
    if (!text) continue;

    const raw = String(tc.output || "").trim();
    if (!raw) return text; // 无输出时 best-effort 认为成功

    try {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { success?: boolean }).success === true
      ) {
        return text;
      }
    } catch {
      // unknown format：best-effort 使用 text
      return text;
    }
  }
  return extractTextFromUiMessage(message);
}
