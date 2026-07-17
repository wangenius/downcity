/**
 * SessionMessage 与 AI SDK UIMessage 的内部投影转换。
 *
 * 关键点（中文）
 * - SessionMessage 是唯一持久化事实；UIMessage 只在 Executor/Composer 边界临时构造。
 * - action/error 不转换为模型消息。
 * - part_id 只服务 Session Message identity，不传入模型协议。
 */

import type { UIMessage } from "ai";
import {
  to_session_json_value,
  to_session_provider_metadata,
} from "@/session/messages/SessionJsonValue.js";
import type {
  SessionAssistantMessage,
  SessionAssistantMessagePart,
  SessionMessage,
  SessionUserMessage,
  SessionUserMessagePart,
} from "@/types/session/SessionMessage.js";
import type {
  SessionMessageRecordV1,
  SessionMetadataV1,
  SessionRecordV1,
} from "@/executor/types/SessionRecords.js";
import type { SessionContextSnapshot } from "@/types/session/SessionSegment.js";

/** 把 canonical Session 历史快照投影为内部 UIMessage records。 */
export function to_executor_history(
  session_id: string,
  snapshot: Readonly<SessionContextSnapshot>,
): SessionRecordV1[] {
  const records: SessionRecordV1[] = [];
  if (snapshot.summary) {
    records.push({
      id: snapshot.summary.summary_id,
      role: "assistant",
      metadata: {
        v: 1,
        ts: snapshot.summary.created_at,
        sessionId: session_id,
        source: "compact",
        kind: "summary",
        extra: {
          visibility: "internal",
          summaryThroughSequence: snapshot.summary.through_sequence,
        },
      },
      parts: [{ type: "text", text: snapshot.summary.text }],
    });
  }
  for (const message of snapshot.messages) {
    const record = to_executor_ui_message(message);
    if (record) records.push(record);
  }
  return records;
}

/** 把 Session Message 投影成 Executor 可消费的 UIMessage。 */
export function to_executor_ui_message(
  message: SessionMessage,
): SessionMessageRecordV1 | null {
  if (message.type !== "user" && message.type !== "assistant") return null;
  const metadata: SessionMetadataV1 = {
    v: 1,
    ts: message.updated_at,
    sessionId: message.session_id,
    turnId: message.turn_id,
    source:
      message.type === "user"
        ? "ingress"
        : message.kind === "summary"
          ? "compact"
          : "egress",
    kind:
      message.type === "assistant" && message.kind === "summary"
        ? "summary"
        : "normal",
    extra: {
      sequence: message.sequence,
      revision: message.revision,
      visibility: message.visibility,
      ...(message.type === "user"
        ? { inputType: message.input_type }
        : { segmentIndex: message.segment_index, status: message.status }),
    },
  };
  return {
    id: message.message_id,
    role: message.type,
    metadata,
    parts:
      message.type === "user"
        ? to_ui_user_parts(message.parts)
        : to_ui_assistant_parts(message.parts),
  } as SessionMessageRecordV1;
}

/** 把 AI SDK user parts 转换成可持久化 Session parts。 */
export function from_ui_user_parts(
  parts: UIMessage["parts"] | null | undefined,
): SessionUserMessagePart[] {
  if (!Array.isArray(parts)) return [];
  return parts.flatMap<SessionUserMessagePart>((part, index) => {
    if (!part || typeof part !== "object") return [];
    const candidate = part as Record<string, unknown>;
    if (candidate.type === "text") {
      return [{
        part_id: `user-text:${index + 1}`,
        type: "text" as const,
        text: String(candidate.text || ""),
        state: "done" as const,
      }];
    }
    if (candidate.type === "file") {
      return [{
        part_id: `user-file:${index + 1}`,
        type: "file" as const,
        url: String(candidate.url || ""),
        media_type: String(candidate.mediaType || "application/octet-stream"),
        ...(candidate.filename ? { filename: String(candidate.filename) } : {}),
      }];
    }
    if (String(candidate.type || "").startsWith("data-")) {
      return [{
        part_id: `user-data:${index + 1}`,
        type: "data" as const,
        data_type: String(candidate.type),
        data: to_session_json_value(candidate.data),
      }];
    }
    return [];
  });
}

/** 把最终 AI SDK assistant parts 转换成 Session parts。 */
export function from_ui_assistant_parts(
  parts: UIMessage["parts"] | null | undefined,
): SessionAssistantMessagePart[] {
  if (!Array.isArray(parts)) return [];
  return parts.flatMap<SessionAssistantMessagePart>((part, index) => {
    if (!part || typeof part !== "object") return [];
    const candidate = part as Record<string, unknown>;
    const type = String(candidate.type || "");
    if (type === "text" || type === "reasoning") {
      return [{
        part_id: `${type}:${index + 1}`,
        sequence: index + 1,
        type: type as "text" | "reasoning",
        text: String(candidate.text || ""),
        state: "done" as const,
      }];
    }
    if (type === "file") {
      return [{
        part_id: `file:${index + 1}`,
        sequence: index + 1,
        type: "file" as const,
        url: String(candidate.url || ""),
        media_type: String(candidate.mediaType || "application/octet-stream"),
        ...(candidate.filename ? { filename: String(candidate.filename) } : {}),
      }];
    }
    if (type === "dynamic-tool" || type.startsWith("tool-")) {
      const state = String(candidate.state || "");
      const call_provider_metadata = to_session_provider_metadata(
        candidate.callProviderMetadata,
      );
      const result_provider_metadata = to_session_provider_metadata(
        candidate.resultProviderMetadata,
      );
      return [{
        part_id: String(candidate.toolCallId || `tool:${index + 1}`),
        sequence: index + 1,
        type: "tool" as const,
        tool_call_id: String(candidate.toolCallId || `tool:${index + 1}`),
        tool_name:
          String(candidate.toolName || "").trim() ||
          type.replace(/^tool-/, "") ||
          "unknown",
        state:
          state === "output-available"
            ? "completed" as const
            : state === "output-error" || state === "output-denied"
              ? "failed" as const
              : state === "approval-requested"
                ? "approval-required" as const
                : state === "input-streaming"
                  ? "input-streaming" as const
                  : state === "input-available"
                    ? "ready" as const
                    : "running" as const,
        ...(candidate.input !== undefined
          ? { input: to_session_json_value(candidate.input) }
          : {}),
        ...(candidate.output !== undefined
          ? { output: to_session_json_value(candidate.output) }
          : {}),
        ...(candidate.errorText ? { error: String(candidate.errorText) } : {}),
        ...(call_provider_metadata !== undefined
          ? { call_provider_metadata }
          : {}),
        ...(result_provider_metadata !== undefined
          ? { result_provider_metadata }
          : {}),
        ...(typeof candidate.providerExecuted === "boolean"
          ? { provider_executed: candidate.providerExecuted }
          : {}),
      }];
    }
    return [];
  });
}

/** 提取 Assistant Message 的最终可见文本。 */
export function extract_session_assistant_text(
  message: SessionAssistantMessage | null | undefined,
): string {
  if (!message) return "";
  return message.parts
    .flatMap((part) => part.type === "text" ? [part.text] : [])
    .join("")
    .trim();
}

function to_ui_user_parts(parts: SessionUserMessagePart[]): UIMessage["parts"] {
  return parts.map((part) => {
    if (part.type === "text") {
      return { type: "text", text: part.text, state: part.state };
    }
    if (part.type === "file") {
      return {
        type: "file",
        url: part.url,
        mediaType: part.media_type,
        ...(part.filename ? { filename: part.filename } : {}),
      };
    }
    return {
      type: part.data_type,
      data: part.data,
    } as UIMessage["parts"][number];
  });
}

function to_ui_assistant_parts(
  parts: SessionAssistantMessagePart[],
): UIMessage["parts"] {
  return parts.map((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return { type: part.type, text: part.text, state: part.state };
    }
    if (part.type === "file") {
      return {
        type: "file",
        url: part.url,
        mediaType: part.media_type,
        ...(part.filename ? { filename: part.filename } : {}),
      };
    }
    if (part.type === "data") {
      return {
        type: part.data_type,
        data: part.data,
      } as UIMessage["parts"][number];
    }
    if (!("tool_call_id" in part)) {
      throw new Error(`Unsupported Assistant part: ${part.type}`);
    }
    const input = part.input ?? parse_json(part.input_text);
    const call_provider_fields = {
      ...(part.call_provider_metadata !== undefined
        ? { callProviderMetadata: part.call_provider_metadata }
        : {}),
      ...(part.provider_executed !== undefined
        ? { providerExecuted: part.provider_executed }
        : {}),
    };
    if (part.state === "completed") {
      return {
        type: "dynamic-tool",
        toolName: part.tool_name,
        toolCallId: part.tool_call_id,
        state: "output-available",
        input,
        output: part.output,
        ...call_provider_fields,
        ...(part.result_provider_metadata !== undefined
          ? { resultProviderMetadata: part.result_provider_metadata }
          : {}),
      };
    }
    if (part.state === "failed") {
      return {
        type: "dynamic-tool",
        toolName: part.tool_name,
        toolCallId: part.tool_call_id,
        state: "output-error",
        input,
        errorText: part.error || "Tool failed",
        ...call_provider_fields,
        ...(part.result_provider_metadata !== undefined
          ? { resultProviderMetadata: part.result_provider_metadata }
          : {}),
      };
    }
    if (part.state === "approval-required") {
      return {
        type: "dynamic-tool",
        toolName: part.tool_name,
        toolCallId: part.tool_call_id,
        state: "approval-requested",
        input,
        approval: { id: part.approval?.approval_id || `approval:${part.tool_call_id}` },
        ...call_provider_fields,
      };
    }
    return {
      type: "dynamic-tool",
      toolName: part.tool_name,
      toolCallId: part.tool_call_id,
      state: part.state === "input-streaming" ? "input-streaming" : "input-available",
      input,
      ...call_provider_fields,
    };
  }) as UIMessage["parts"];
}

function parse_json(input: string | undefined): unknown {
  const value = String(input || "").trim();
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
