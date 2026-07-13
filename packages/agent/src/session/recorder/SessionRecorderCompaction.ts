/**
 * SessionRecorder Active/Segment 上下文压缩。
 *
 * Compact 把 Active 前缀写入不可变 Segment，并在 footer 保存累计 Summary。
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
import type { SessionMessage } from "@/types/session/SessionMessage.js";

/** 必要时把 Active 前缀关闭为带累计 Summary 的 Segment。 */
export async function compact_session_recorder_messages(input: {
  /** 当前 Session Recorder。 */
  recorder: SessionRecorder;
  /** 压缩策略和模型。 */
  compact_input: SessionHistoryCompactInput;
}): Promise<{ compacted: boolean; reason?: string }> {
  const snapshot = await input.recorder.context_snapshot();
  const context_messages = snapshot.messages.filter(
    (message) => message.type === "user" || message.type === "assistant",
  );
  if (context_messages.length < 4) {
    return { compacted: false, reason: "small_messages" };
  }
  const system_text = input.compact_input.system
    .map((message) => String(message.content || ""))
    .join("\n\n");
  const estimated_tokens = Math.ceil(
    `${system_text}\n${snapshot.summary?.text || ""}\n${JSON.stringify(context_messages)}`.length / 3,
  );
  if (estimated_tokens <= input.compact_input.maxInputTokensApprox) {
    return { compacted: false, reason: "under_budget" };
  }

  const ratio = Math.max(0.1, Math.min(0.9, input.compact_input.compactRatio));
  const keep_last_messages = Math.max(1, input.compact_input.keepLastMessages);
  const max_compact_count = context_messages.length - keep_last_messages;
  if (max_compact_count < 2) {
    return { compacted: false, reason: "keep_last_messages" };
  }
  const compact_count = Math.min(
    max_compact_count,
    Math.max(2, Math.floor(context_messages.length * ratio)),
  );
  const older = context_messages.slice(0, compact_count);
  const boundary = older.at(-1);
  if (!boundary) return { compacted: false, reason: "nothing_to_compact" };

  const action_id = `compacting:${input.recorder.session_id}:${generateId()}`;
  await publish_action(input.compact_input.onAction, {
    id: action_id,
    session_id: input.recorder.session_id,
    title: "Compacting session messages",
    state: "running",
  });

  const conversation_text = older
    .map((message) => message_to_compaction_text(message))
    .filter(Boolean)
    .join("\n");
  const previous_summary_text = String(snapshot.summary?.text || "").trim();
  const prompt = previous_summary_text
    ? build_update_session_compaction_prompt({
        previous_summary: previous_summary_text,
        new_conversation_text: conversation_text || "(none)",
      })
    : build_initial_session_compaction_prompt({
        conversation_text: conversation_text || "(none)",
      });

  let summary: string;
  try {
    const result = await generateText({
      model: input.compact_input.model,
      system: [{ role: "system", content: SESSION_COMPACTION_SYSTEM_PROMPT }],
      prompt,
    });
    summary = String(result.text || "").trim();
  } catch (error) {
    await publish_action(input.compact_input.onAction, {
      id: action_id,
      session_id: input.recorder.session_id,
      title: "Session message compaction failed",
      description: error instanceof Error ? error.message : String(error),
      state: "failed",
    });
    return { compacted: false, reason: "summary_failed" };
  }
  if (!summary) {
    await publish_action(input.compact_input.onAction, {
      id: action_id,
      session_id: input.recorder.session_id,
      title: "Session message compaction failed",
      description: "The compaction model returned an empty Summary.",
      state: "failed",
    });
    return { compacted: false, reason: "summary_failed" };
  }

  await input.recorder.compact_active({
    through_sequence: boundary.sequence,
    summary: {
      record_type: "summary",
      session_id: input.recorder.session_id,
      summary_id: `summary:${input.recorder.session_id}:${generateId()}`,
      through_sequence: boundary.sequence,
      text: summary,
      created_at: Date.now(),
    },
  });
  await publish_action(input.compact_input.onAction, {
    id: action_id,
    session_id: input.recorder.session_id,
    title: "Session messages compacted",
    description: `Closed Active through Message ${boundary.message_id}.`,
    state: "completed",
  });
  return { compacted: true };
}

function message_to_compaction_text(message: SessionMessage): string {
  const projected = to_executor_ui_message(message);
  if (!projected) return "";
  return JSON.stringify({
    role: projected.role,
    parts: projected.parts,
  });
}

async function publish_action(
  callback: SessionHistoryCompactInput["onAction"],
  input: {
    id: string;
    session_id: string;
    title: string;
    description?: string;
    state: "running" | "completed" | "failed";
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
