/**
 * JsonlSessionCompactionExecutor：JSONL session 压缩执行模块。
 *
 * 关键职责（中文）
 * - 评估当前消息是否超出输入预算。
 * - 在锁外生成“更早历史摘要”，降低锁持有时间。
 * - 在锁内完成归档与 messages.jsonl 重写，保证并发安全。
 */

import fs from "fs-extra";
import path from "node:path";
import {
  generateText,
  isTextUIPart,
  type LanguageModel,
  type SystemModelMessage,
} from "ai";
import { generateId } from "@/utils/Id.js";
import { getLogger } from "@/utils/logger/Logger.js";
import type {
  SessionActionRecordV1,
  SessionRecordV1,
  SessionMetadataV1,
  SessionMessageRecordV1,
} from "@/executor/types/SessionRecords.js";
import {
  is_session_message_record,
} from "@/executor/types/SessionRecords.js";
import type { SessionHistoryMetaV1 } from "@/executor/types/SessionHistoryMeta.js";
import {
  append_session_compaction_file_operations,
  build_initial_session_compaction_prompt,
  build_update_session_compaction_prompt,
  SESSION_COMPACTION_SYSTEM_PROMPT,
} from "@executor/composer/compaction/jsonl/JsonlSessionCompactionPrompts.js";
import { format_session_compaction_file_operations } from "@executor/composer/compaction/jsonl/JsonlSessionCompactionFileOperations.js";

export type SessionCompactParams = {
  model: LanguageModel;
  system: Array<SystemModelMessage>;
  keepLastMessages: number;
  maxInputTokensApprox: number;
  archiveOnCompact: boolean;
  compactRatio: number;
  onAction?: (action: SessionActionRecordV1) => Promise<void>;
};

type SessionCompactDeps = {
  rootPath: string;
  sessionId: string;
  withWriteLock: <T>(fn: () => Promise<T>) => Promise<T>;
  loadAll: () => Promise<SessionRecordV1[]>;
  createSummaryMessage: (params: {
    text: string;
    archiveId?: string;
    sourceRange?: SessionMetadataV1["sourceRange"];
  }) => SessionRecordV1;
  getArchiveDirPath: () => string;
  getMessagesFilePath: () => string;
  readMetaUnsafe: () => Promise<SessionHistoryMetaV1>;
  writeMetaUnsafe: (next: SessionHistoryMetaV1) => Promise<void>;
};

/**
 * 对当前 session messages 做一次 best-effort compact（必要时）。
 *
 * 注意（中文）
 * - compact 会 rewrite `messages.jsonl`（不是纯 append-only），因此必须防并发覆盖
 * - 这里做两阶段锁：先 snapshot 再生成摘要，最后再锁定写入，降低锁持有时间
 */
export async function compactSessionMessagesIfNeeded(
  deps: SessionCompactDeps,
  params: SessionCompactParams,
): Promise<{ compacted: boolean; reason?: string }> {
  const logger = getLogger(deps.rootPath, "info");
  const action_id = `compacting:${deps.sessionId}:${Date.now()}:${generateId()}`;
  let action_started = false;

  const publish_action = async (
    action: Omit<SessionActionRecordV1, "type" | "id" | "metadata">,
  ): Promise<void> => {
    if (typeof params.onAction !== "function") return;
    await params.onAction({
      type: "action",
      id: action_id,
      ...action,
      metadata: {
        v: 1,
        ts: Date.now(),
        sessionId: deps.sessionId,
      },
    });
  };

  // 算法阶段（中文）
  // phase 1：snapshot（短锁）
  // - 仅负责拿一致性快照，不做耗时的模型调用。
  // - 目的是把锁持有时间降到最低。
  let snapshot: SessionMessageRecordV1[] = [];
  let snapshotTailId = "";
  await deps.withWriteLock(async () => {
    snapshot = (await deps.loadAll()).filter(is_session_message_record);
    snapshotTailId =
      snapshot.length > 0
        ? String(snapshot[snapshot.length - 1].id || "")
        : "";
  });

  if (snapshot.length < 4) {
    return { compacted: false, reason: "small_messages" };
  }

  const systemText = (params.system || [])
    .map((m) => String(m.content ?? ""))
    .join("\n\n");
  // 关键点（中文）：session messages 现在可能包含 tool parts / output，必须把它们计入预算估算，否则会低估 token。
  let messagesJson = "";
  try {
    messagesJson = JSON.stringify(snapshot);
  } catch {
    messagesJson = "";
  }
  const est = estimateTokensApproxFromText(systemText + "\n\n" + messagesJson);
  if (est <= params.maxInputTokensApprox) {
    return { compacted: false, reason: "under_budget" };
  }

  // 关键点（中文）：触发 compact 后，优先压缩“最早一段消息”，默认比例 50%。
  const compactRatio = normalizeCompactRatio(params.compactRatio);
  const compactCount = resolveCompactCount(snapshot.length, compactRatio);
  const older = snapshot.slice(0, compactCount);
  if (older.length === 0) return { compacted: false, reason: "nothing_to_compact" };

  action_started = true;
  await publish_action({
    title: "Compacting session records",
    state: "running",
  });

  const previous_summary = extract_existing_compaction_summary(older[0]);
  const conversation_messages = previous_summary ? older.slice(1) : older;
  const olderTextAll = extractPlainTextFromMessages(conversation_messages);
  const maxOlderChars = 24_000;
  const olderText =
    olderTextAll.length > maxOlderChars
      ? "（注意：更早历史过长，已截断保留末尾）\n" + olderTextAll.slice(-maxOlderChars)
      : olderTextAll;
  const prompt = previous_summary
    ? build_update_session_compaction_prompt({
        previous_summary,
        new_conversation_text: olderText || "(none)",
      })
    : build_initial_session_compaction_prompt({
        conversation_text: olderText || "(none)",
      });
  const file_operations_xml = format_session_compaction_file_operations(older);

  // phase 1.5：生成摘要（不持锁）
  // - 这一步最耗时，必须在锁外执行，避免阻塞 append。
  let summary = "";
  try {
    const r = await generateText({
      model: params.model,
      system: [
        {
          role: "system",
          content: SESSION_COMPACTION_SYSTEM_PROMPT,
        },
      ],
      prompt,
    });
    summary = append_session_compaction_file_operations({
      summary: String(r.text || "").trim(),
      file_operations_xml,
    });
  } catch (e) {
    await logger.log(
      "warn",
      "Session messages compact summary failed, fallback to lossy truncation",
      {
        sessionId: deps.sessionId,
        error: String(e),
      },
    );
    summary = append_session_compaction_file_operations({
      summary: "（系统自动压缩：摘要生成失败，已丢弃更早历史，仅保留最近对话。）",
      file_operations_xml,
    });
    await publish_action({
      title: "Compacting session records",
      description: "Summary generation failed; using a fallback summary.",
      state: "running",
    });
  }

  const fromId = String(older[0]?.id || "");
  const toId = String(older[older.length - 1]?.id || "");
  const archiveId = `compact-${Date.now()}-${generateId()}`;
  const summaryMsg = deps.createSummaryMessage({
    text: summary,
    archiveId,
    sourceRange: fromId && toId ? { fromId, toId, count: older.length } : undefined,
  });

  // phase 2：写入（短锁，且避免覆盖新追加）
  // - 以“当前最新 session messages”为准重算 currentOlder / currentKept，避免覆盖并发新消息。
  await deps.withWriteLock(async () => {
    const current = await deps.loadAll();
    if (!current.length) return;

    // 如果 tail 不同，说明期间有新消息追加；我们仍可安全 compact：按“当前长度 + 相同比例”重算。
    // snapshotTailId 用于 debug，不作为强一致性依赖。
    void snapshotTailId;

    const current_model_messages = current.filter(
      is_session_message_record,
    );
    const currentCompactCount = resolveCompactCount(
      current_model_messages.length,
      compactRatio,
    );
    const currentOlder = current_model_messages.slice(0, currentCompactCount);
    if (currentOlder.length === 0) return;
    const compacted_ids = new Set(
      currentOlder
        .map((message) => String(message.id || "").trim())
        .filter(Boolean),
    );

    if (params.archiveOnCompact) {
      const archivePath = path.join(
        deps.getArchiveDirPath(),
        `${encodeURIComponent(String(archiveId || "").trim())}.json`,
      );
      await fs.writeJson(
        archivePath,
        {
          v: 1,
          sessionId: deps.sessionId,
          archivedAt: Date.now(),
          messages: currentOlder,
        },
        { spaces: 2 },
      );
    }

    const next = [
      summaryMsg,
      ...current.filter((message) => {
        const id = String(message.id || "").trim();
        return !id || !compacted_ids.has(id);
      }),
    ];

    const messagesPath = deps.getMessagesFilePath();
    const tmp = messagesPath + ".tmp";
    await fs.writeFile(tmp, next.map((m) => JSON.stringify(m)).join("\n") + "\n", "utf8");
    await fs.move(tmp, messagesPath, { overwrite: true });

    const prevMeta = await deps.readMetaUnsafe();
    await deps.writeMetaUnsafe({
      ...prevMeta,
      updatedAt: Date.now(),
    });
  });

  if (action_started) {
    await publish_action({
      title: "Session records compacted",
      description: `Compacted ${String(older.length)} earlier messages into ${archiveId}.`,
      state: "completed",
    });
  }

  return { compacted: true };
}

/**
 * 归一化压缩比例。
 *
 * 关键点（中文）
 * - 仅允许 0.1~0.9，避免“几乎不压缩”或“几乎全压缩”。
 */
function normalizeCompactRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.1, Math.min(0.9, value));
}

/**
 * 按比例计算前段压缩条数。
 *
 * 关键点（中文）
 * - 至少压缩 1 条；
 * - 至少保留 1 条未压缩消息。
 */
function resolveCompactCount(total: number, ratio: number): number {
  const n = Math.max(0, Math.floor(total));
  if (n <= 1) return 0;
  const raw = Math.floor(n * ratio);
  return Math.max(1, Math.min(n - 1, raw));
}

/**
 * 近似 token 估算。
 *
 * 算法说明（中文）
 * - 这里使用经验近似，不追求精确 tokenizer 一致性。
 * - 目标是为 compact 提供保守预算，宁可略高估也不要低估。
 */
function estimateTokensApproxFromText(text: string): number {
  const t = String(text || "");
  // 经验值：英文 ~4 chars/token；中文更接近 1-2 chars/token。这里用保守的 3 chars/token。
  return Math.ceil(t.length / 3);
}

/**
 * 从 UIMessage 提取可摘要的纯文本。
 *
 * 关键点（中文）
 * - 统一把 user / assistant 内容线性化，作为 compact 摘要输入。
 * - tool 原始结构不会原样输出，避免把噪声日志喂给摘要模型。
 */
function extractPlainTextFromMessages(messages: SessionMessageRecordV1[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "user" ? "user" : "assistant";
    const parts = Array.isArray(m.parts) ? m.parts : [];
    const textParts = parts.filter(isTextUIPart).map((p) => String(p.text ?? ""));
    const text = textParts.join("\n").trim();
    if (!text) continue;
    lines.push(`${role}: ${text}`);
  }
  return lines.join("\n");
}

/**
 * 从已有 compact summary 消息中提取旧摘要。
 *
 * 关键点（中文）
 * - 旧摘要通常位于 messages.jsonl 第一条，后续 compact 应基于它迭代更新。
 * - 只识别 compact 生成的 summary，避免误把普通 assistant 文本当作旧摘要。
 */
function extract_existing_compaction_summary(
  message: SessionMessageRecordV1 | undefined,
): string {
  if (!message || typeof message !== "object") return "";
  const metadata = message.metadata;
  if (metadata?.source !== "compact" || metadata.kind !== "summary") return "";
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .filter(isTextUIPart)
    .map((part) => String(part.text ?? ""))
    .join("\n")
    .trim();
}
