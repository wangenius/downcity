/**
 * Agent Chat TUI canonical Session Message 历史加载器。
 *
 * 直接按 Message sequence 和 assistant parts 顺序生成条目，不构造第二套 timeline。
 */

import type { SessionMessage } from "@downcity/agent";
import type { TranscriptEntry } from "@/city/agent/tui/types.js";

/** 将 canonical Session Message 列表转换为 transcript 条目。 */
export function session_messages_to_entries(
  messages: SessionMessage[],
): TranscriptEntry[] {
  return [...messages]
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap((message) => message_to_entries(message));
}

function message_to_entries(message: SessionMessage): TranscriptEntry[] {
  if (message.type === "user") {
    return [{
      id: message.message_id,
      kind: "user",
      text: message.parts
        .flatMap((part) => part.type === "text" ? [part.text] : [])
        .join(""),
      created_at: message.created_at,
    }];
  }
  if (message.type === "action") {
    return [{
      id: message.message_id,
      kind: "status",
      text: [message.title, message.description, message.status]
        .filter(Boolean)
        .join(" · "),
      created_at: message.created_at,
    }];
  }
  if (message.type === "error") {
    return [{
      id: message.message_id,
      kind: "error",
      text: message.message,
      created_at: message.created_at,
    }];
  }

  return message.parts.flatMap<TranscriptEntry>((part) => {
    if (part.type === "text") {
      return part.text
        ? [{
            id: `${message.message_id}:${part.part_id}`,
            kind: "assistant",
            text: part.text,
            streaming: false,
            created_at: message.created_at,
          }]
        : [];
    }
    if (part.type === "tool") {
      return [{
        id: `${message.message_id}:${part.part_id}`,
        kind: "tool-call",
        tool_call_id: part.tool_call_id,
        tool_name: part.tool_name,
        args: to_json_object(part.input),
        ...(part.output !== undefined
          ? { result: stringify_value(part.output) }
          : part.error ? { result: part.error } : {}),
        status:
          part.state === "completed"
            ? "success"
            : part.state === "failed"
              ? "error"
              : "pending",
        created_at: message.created_at,
      }];
    }
    return [];
  });
}

function to_json_object(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function stringify_value(input: unknown): string {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
