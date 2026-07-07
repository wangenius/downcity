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
  SessionMessageV1,
  SessionMetadataV1,
  SessionModelMessageV1,
} from "@/executor/types/SessionMessages.js";
import {
  isSessionActionMessage,
  isSessionModelMessage,
} from "@/executor/types/SessionMessages.js";
import type { SessionHistoryMetaV1 } from "@/executor/types/SessionHistoryMeta.js";
import type { AgentSessionActionRecord } from "@/types/sdk/AgentSessionAction.js";

export type SessionCompactParams = {
  model: LanguageModel;
  system: Array<SystemModelMessage>;
  keepLastMessages: number;
  maxInputTokensApprox: number;
  archiveOnCompact: boolean;
  compactRatio: number;
  onAction?: (action: AgentSessionActionRecord) => Promise<void>;
};

type SessionCompactDeps = {
  rootPath: string;
  sessionId: string;
  withWriteLock: <T>(fn: () => Promise<T>) => Promise<T>;
  loadAll: () => Promise<SessionMessageV1[]>;
  createSummaryMessage: (params: {
    text: string;
    archiveId?: string;
    sourceRange?: SessionMetadataV1["sourceRange"];
  }) => SessionMessageV1;
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
    action: Omit<AgentSessionActionRecord, "id">,
  ): Promise<void> => {
    if (typeof params.onAction !== "function") return;
    await params.onAction({
      id: action_id,
      ...action,
    });
  };

  // 算法阶段（中文）
  // phase 1：snapshot（短锁）
  // - 仅负责拿一致性快照，不做耗时的模型调用。
  // - 目的是把锁持有时间降到最低。
  let snapshot: SessionModelMessageV1[] = [];
  let snapshotTailId = "";
  await deps.withWriteLock(async () => {
    snapshot = (await deps.loadAll()).filter(isSessionModelMessage);
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
    title: "Compacting session history",
    state: "running",
  });

  const olderTextAll = extractPlainTextFromMessages(older);
  const maxOlderChars = 24_000;
  const olderText =
    olderTextAll.length > maxOlderChars
      ? "（注意：更早历史过长，已截断保留末尾）\n" + olderTextAll.slice(-maxOlderChars)
      : olderTextAll;

  // phase 1.5：生成摘要（不持锁）
  // - 这一步最耗时，必须在锁外执行，避免阻塞 append。
  let summary = "";
  try {
    const r = await generateText({
      model: params.model,
      system: [
        {
          role: "system",
          content:
            "你是对话压缩助手。请把更早的对话历史压缩成“可持续复用”的工作摘要。\n" +
            "要求：\n" +
            "- 输出中文\n" +
            "- 不要复述无关细节，不要输出工具原始日志\n" +
            "- 必须包含：已确认事实/用户偏好约束/已做决策/未完成事项\n" +
            "- 使用 Markdown 列表，控制在 300~800 字",
        },
      ],
      prompt: `请压缩以下更早历史（按 user/assistant 交替记录）：\n\n${olderText}`,
    });
    summary = String(r.text || "").trim();
  } catch (e) {
    await logger.log(
      "warn",
      "Session messages compact summary failed, fallback to lossy truncation",
      {
        sessionId: deps.sessionId,
        error: String(e),
      },
    );
    summary = "（系统自动压缩：摘要生成失败，已丢弃更早历史，仅保留最近对话。）";
    await publish_action({
      title: "Compacting session history",
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
      isSessionModelMessage,
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
      title: "Session history compacted",
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
function extractPlainTextFromMessages(messages: SessionModelMessageV1[]): string {
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
