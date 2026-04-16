/**
 * AcpPromptText：ACP prompt 文本组装工具。
 *
 * 关键点（中文）
 * - ACP adapter 只接收 prompt text，这里集中组装输出契约、system 与历史。
 * - 历史回灌只拼接 `type=text` 的用户可见消息，避免 tool/reasoning part 混入。
 */

import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";
import { buildAcpVisibleOutputContract } from "./AcpVisibleText.js";

/**
 * 构建发送给 ACP agent 的 prompt 文本。
 */
export function buildAcpPromptText(params: {
  query: string;
  bootstrapped: boolean;
  systemMessages: Array<{ content?: unknown }>;
  historyMessages: SessionMessageV1[];
}): string {
  const query = String(params.query || "").trim();
  const outputContract = buildAcpVisibleOutputContract();
  if (params.bootstrapped) {
    return [
      outputContract,
      [
        "## Current User Request",
        query,
      ].join("\n"),
    ].join("\n\n");
  }

  const sections: string[] = [outputContract];
  const systemText = params.systemMessages
    .map((message) => normalizeSystemMessageText(message.content))
    .filter(Boolean)
    .join("\n\n");
  if (systemText) {
    sections.push(
      [
        "## System Instructions",
        systemText,
      ].join("\n"),
    );
  }

  const historyText = params.historyMessages
    .map((message) => stringifySessionMessage(message))
    .filter(Boolean)
    .join("\n\n");
  if (historyText) {
    sections.push(
      [
        "## Conversation History",
        historyText,
      ].join("\n"),
    );
  }

  sections.push(
    [
      "## Current User Request",
      query,
    ].join("\n"),
  );
  return sections.join("\n\n");
}

function normalizeSystemMessageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item) =>
      item && typeof item === "object" && "text" in item
        ? String((item as { text?: unknown }).text || "").trim()
        : "",
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

function stringifySessionMessage(message: SessionMessageV1): string {
  const role = message.role === "assistant" ? "Assistant" : "User";
  const text = Array.isArray(message.parts)
    ? message.parts
        .map((part) =>
          part && typeof part === "object" && "type" in part && part.type === "text"
            ? String((part as { text?: unknown }).text || "")
            : "",
        )
        .filter(Boolean)
        .join("\n")
        .trim()
    : "";
  if (!text) return "";
  return `${role}: ${text}`;
}
