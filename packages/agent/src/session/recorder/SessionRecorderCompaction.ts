/**
 * SessionRecorder canonical 上下文压缩。
 *
 * 压缩只追加一条 internal summary Message，不删除、不归档、不重写 Mutation 日志。
 */

import { generateText } from "ai";
import { generateId } from "@/utils/Id.js";
import type { SessionHistoryCompactInput } from "@/executor/store/history/SessionHistoryStore.js";
import type { SessionActionRecordV1 } from "@/executor/types/SessionRecords.js";
import {
  build_initial_session_compaction_prompt,
  build_update_session_compaction_prompt,
  SESSION_COMPACTION_SYSTEM_PROMPT,
} from "@executor/composer/compaction/jsonl/JsonlSessionCompactionPrompts.js";
import { SessionRecorder } from "@/session/recorder/SessionRecorder.js";
import { to_executor_ui_message } from "@/session/recorder/SessionMessageCodec.js";
import type { SessionAssistantMessage, SessionMessage } from "@/types/session/SessionMessage.js";

/** 必要时把较早上下文追加为 canonical internal summary。 */
export async function compact_session_recorder_messages(input: {
  /** 当前 Session Recorder。 */
  recorder: SessionRecorder;
  /** 压缩策略和模型。 */
  compact_input: SessionHistoryCompactInput;
}): Promise<{ compacted: boolean; reason?: string }> {
  const page = await input.recorder.list_messages({
    limit: 500,
    include_internal: true,
  });
  const context_messages = project_current_context(page.items);
  if (context_messages.length < 4) {
    return { compacted: false, reason: "small_messages" };
  }
  const system_text = input.compact_input.system
    .map((message) => String(message.content || ""))
    .join("\n\n");
  const estimated_tokens = Math.ceil(
    `${system_text}\n${JSON.stringify(context_messages)}`.length / 3,
  );
  if (estimated_tokens <= input.compact_input.maxInputTokensApprox) {
    return { compacted: false, reason: "under_budget" };
  }

  const ratio = Math.max(0.1, Math.min(0.9, input.compact_input.compactRatio));
  const compact_count = Math.max(
    2,
    Math.min(context_messages.length - 1, Math.floor(context_messages.length * ratio)),
  );
  const older = context_messages.slice(0, compact_count);
  const boundary = [...older]
    .reverse()
    .find((message) => message.type !== "assistant" || message.kind !== "summary");
  if (!boundary) return { compacted: false, reason: "nothing_to_compact" };

  const action_id = `compacting:${input.recorder.session_id}:${generateId()}`;
  await publish_action(input.compact_input.onAction, {
    id: action_id,
    session_id: input.recorder.session_id,
    title: "Compacting session messages",
    state: "running",
  });

  const previous_summary = older.find(
    (message): message is SessionAssistantMessage =>
      message.type === "assistant" && message.kind === "summary",
  );
  const conversation_text = older
    .filter((message) => message !== previous_summary)
    .map((message) => message_to_compaction_text(message))
    .filter(Boolean)
    .join("\n")
    .slice(-24_000);
  const previous_summary_text = previous_summary
    ? assistant_text(previous_summary)
    : "";
  const prompt = previous_summary_text
    ? build_update_session_compaction_prompt({
        previous_summary: previous_summary_text,
        new_conversation_text: conversation_text || "(none)",
      })
    : build_initial_session_compaction_prompt({
        conversation_text: conversation_text || "(none)",
      });

  let summary = "";
  try {
    const result = await generateText({
      model: input.compact_input.model,
      system: [{ role: "system", content: SESSION_COMPACTION_SYSTEM_PROMPT }],
      prompt,
    });
    summary = String(result.text || "").trim();
  } catch {
    summary = "Earlier conversation was compacted because the context window was exceeded.";
  }

  await input.recorder.append_completed_assistant_message({
    turn_id: `compact:${input.recorder.session_id}:${generateId()}`,
    kind: "summary",
    visibility: "internal",
    summary_through_message_id: boundary.message_id,
    parts: [{
      part_id: `summary-text:${generateId()}`,
      sequence: 1,
      type: "text",
      text: summary,
      state: "done",
    }],
  });
  await publish_action(input.compact_input.onAction, {
    id: action_id,
    session_id: input.recorder.session_id,
    title: "Session messages compacted",
    description: `Compacted through Message ${boundary.message_id}.`,
    state: "completed",
  });
  return { compacted: true };
}

function project_current_context(messages: SessionMessage[]): SessionMessage[] {
  const latest_summary = [...messages].reverse().find(
    (message): message is SessionAssistantMessage =>
      message.type === "assistant" &&
      message.kind === "summary" &&
      message.visibility === "internal",
  );
  if (!latest_summary?.summary_through_message_id) {
    return messages.filter(
      (message) => message.type === "user" || message.type === "assistant",
    );
  }
  const boundary_index = messages.findIndex(
    (message) => message.message_id === latest_summary.summary_through_message_id,
  );
  return [
    latest_summary,
    ...messages.slice(boundary_index + 1).filter(
      (message) =>
        message !== latest_summary &&
        (message.type === "user" ||
          message.type === "assistant" && message.kind !== "summary"),
    ),
  ];
}

function message_to_compaction_text(message: SessionMessage): string {
  const projected = to_executor_ui_message(message);
  if (!projected) return "";
  const text = projected.parts
    .flatMap((part) => part.type === "text" ? [String(part.text || "")] : [])
    .join("\n")
    .trim();
  return text ? `${message.type}: ${text}` : "";
}

function assistant_text(message: SessionAssistantMessage): string {
  return message.parts
    .flatMap((part) => part.type === "text" ? [part.text] : [])
    .join("\n")
    .trim();
}

async function publish_action(
  callback: SessionHistoryCompactInput["onAction"],
  input: {
    id: string;
    session_id: string;
    title: string;
    description?: string;
    state: "running" | "completed";
  },
): Promise<void> {
  if (!callback) return;
  const action: SessionActionRecordV1 = {
    type: "action",
    id: input.id,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    state: input.state,
    metadata: {
      v: 1,
      ts: Date.now(),
      sessionId: input.session_id,
    },
  };
  await callback(action);
}
