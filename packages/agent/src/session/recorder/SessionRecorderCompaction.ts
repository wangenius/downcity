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
import { fold_compacted_text } from "@executor/core-engine/CoreEngineContextCompaction.js";
import { SessionRecorder } from "@/session/recorder/SessionRecorder.js";
import { to_executor_ui_message } from "@/session/recorder/SessionMessageCodec.js";
import type { SessionMessage } from "@/types/session/SessionMessage.js";

/** 单次摘要请求中 conversation 文本的最大字符数。 */
const SUMMARY_CHUNK_MAX_CHARS = 20_000;

/** 单条 canonical Message 投影到摘要输入后的最大字符数。 */
const SUMMARY_MESSAGE_MAX_CHARS = 12_000;

/** 上一轮累计 Summary 进入下一次 reduce 请求时的最大字符数。 */
const PREVIOUS_SUMMARY_MAX_CHARS = 12_000;

/** 摘要模型的最大输出 token，用于避免 Summary 自身无限增长。 */
const SUMMARY_MAX_OUTPUT_TOKENS = 4_000;

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
  if (!input.compact_input.force) {
    return { compacted: false, reason: "not_requested" };
  }
  const boundary = context_messages.at(-1);
  if (!boundary) return { compacted: false, reason: "nothing_to_compact" };

  const action_id = `compacting:${input.recorder.session_id}:${generateId()}`;
  await publish_action(input.compact_input.onAction, {
    id: action_id,
    session_id: input.recorder.session_id,
    title: "Compacting session messages",
    state: "running",
  });

  const conversation_messages = context_messages
    .map((message) => message_to_compaction_text(message))
    .filter(Boolean);
  const chunks = build_summary_chunks(conversation_messages);
  let summary = String(snapshot.summary?.text || "").trim();
  let used_fallback = false;
  for (const chunk of chunks) {
    const prompt = summary
      ? build_update_session_compaction_prompt({
          previous_summary: fold_compacted_text(
            summary,
            PREVIOUS_SUMMARY_MAX_CHARS,
          ),
          new_conversation_text: chunk || "(none)",
        })
      : build_initial_session_compaction_prompt({
          conversation_text: chunk || "(none)",
        });
    try {
      const result = await generateText({
        model: input.compact_input.model,
        system: [{ role: "system", content: SESSION_COMPACTION_SYSTEM_PROMPT }],
        prompt,
        maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
      });
      const next_summary = String(result.text || "").trim();
      if (!next_summary) throw new Error("Compaction model returned an empty Summary");
      summary = next_summary;
    } catch {
      used_fallback = true;
      summary = build_deterministic_summary(summary, chunk);
    }
  }
  if (!summary) {
    used_fallback = true;
    summary = build_deterministic_summary("", "(no textual context)");
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
    description: used_fallback
      ? `Closed Active through Message ${boundary.message_id} with deterministic fallback Summary.`
      : `Closed Active through Message ${boundary.message_id}.`,
    state: "completed",
  });
  return { compacted: true };
}

function message_to_compaction_text(message: SessionMessage): string {
  const projected = to_executor_ui_message(message);
  if (!projected) return "";
  const parts = projected.parts
    .filter((part) => part.type !== "reasoning")
    .map((part) => {
      const serialized = safe_stringify(part);
      return serialized.length <= SUMMARY_MESSAGE_MAX_CHARS
        ? part
        : {
            type: part.type,
            compacted_preview: fold_compacted_text(
              serialized,
              SUMMARY_MESSAGE_MAX_CHARS,
            ),
          };
    });
  return fold_compacted_text(safe_stringify({
    role: projected.role,
    parts,
  }), SUMMARY_MESSAGE_MAX_CHARS);
}

/** 按 Message 边界把摘要输入拆为固定字符上限的 chunk。 */
function build_summary_chunks(messages: string[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const message of messages) {
    const value = fold_compacted_text(message, SUMMARY_CHUNK_MAX_CHARS);
    const candidate = current ? `${current}\n${value}` : value;
    if (current && candidate.length > SUMMARY_CHUNK_MAX_CHARS) {
      chunks.push(current);
      current = value;
      continue;
    }
    current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** 摘要模型不可用时仍可完成归档的确定性 checkpoint。 */
function build_deterministic_summary(
  previous_summary: string,
  new_context: string,
): string {
  const body = [
    String(previous_summary || "").trim(),
    String(new_context || "").trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    "## Compacted Context",
    "The summary model was unavailable. The following deterministic checkpoint preserves the beginning and latest context.",
    "",
    fold_compacted_text(body || "(none)", PREVIOUS_SUMMARY_MAX_CHARS),
  ].join("\n");
}

function safe_stringify(value: unknown): string {
  try {
    return JSON.stringify(value) || String(value || "");
  } catch {
    return String(value || "");
  }
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
