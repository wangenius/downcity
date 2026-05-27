/**
 * SDK Session 浏览辅助。
 *
 * 关键点（中文）
 * - 统一负责 session 列表摘要、session 详情与 history 分页的只读投影逻辑。
 * - 面向 SDK / RemoteAgent / HTTP route 复用，避免在多个入口重复拼列表与分页语义。
 * - 这里不持有运行态状态；执行状态等动态信息通过调用参数显式注入。
 */

import fs from "fs-extra";
import {
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type UIMessagePart,
} from "ai";
import type {
  AgentListSessionsInput,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionHistoryView,
  AgentSessionInfo,
  AgentSessionSummary,
  AgentSessionSummaryPage,
  AgentSessionTimelineEvent,
} from "@/sdk/AgentSdkTypes.js";
import type {
  SessionMessageV1,
  SessionMetadataV1,
} from "@/executor/types/SessionMessages.js";
import type { SessionHistoryMetaV1 } from "@/executor/types/SessionHistoryMeta.js";
import { pickLastSuccessfulChatSendText } from "@/plugin/builtins/chat/runtime/UserVisibleText.js";
import { getSdkAgentSessionMessagesPath } from "@/sdk/session/Paths.js";
import { getSdkAgentSessionsRootDirPath } from "@/sdk/session/Paths.js";
import { readSessionMetadata } from "@/sdk/session/Metadata.js";

type AnyUiPart = UIMessagePart<Record<string, never>, Record<string, never>>;

type ToolPartCompatShape = {
  type?: unknown;
  state?: unknown;
  input?: unknown;
  output?: unknown;
  errorText?: unknown;
  error?: unknown;
  approval?: { reason?: unknown } | null;
};

type SessionBrowseBaseInput = {
  /**
   * 当前项目根目录。
   */
  projectRoot: string;

  /**
   * 当前 agentId。
   */
  agentId: string;

  /**
   * 当前 sessionId。
   */
  sessionId: string;

  /**
   * 当前 session 已读取到的 metadata。
   */
  metadata: SessionHistoryMetaV1;

  /**
   * 当前 session 已读取到的完整消息。
   */
  messages: SessionMessageV1[];

  /**
   * 当前 session 是否正在执行。
   */
  executing?: boolean;
};

function decodeMaybe(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function normalizeLimit(input: unknown, fallback: number, max: number): number {
  const value =
    typeof input === "number" && Number.isFinite(input)
      ? input
      : typeof input === "string" && input.trim()
        ? Number(input)
        : NaN;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function truncateText(input: string, maxChars: number): string {
  const value = String(input || "").trim();
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function normalizeCursor(input: unknown): number {
  const raw = String(input || "").trim();
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function encodeCursor(offset: number): string | undefined {
  if (!Number.isFinite(offset) || offset <= 0) return undefined;
  return String(Math.floor(offset));
}

function stringifyForDisplay(input: unknown, maxChars = 2400): string {
  if (input === undefined) return "";
  if (input === null) return "null";
  if (typeof input === "string") {
    const value = input.trim();
    if (!value) return "";
    try {
      const parsed = JSON.parse(value);
      return truncateText(JSON.stringify(parsed, null, 2), maxChars);
    } catch {
      return truncateText(value, maxChars);
    }
  }
  if (typeof input === "number" || typeof input === "boolean") {
    return truncateText(String(input), maxChars);
  }
  try {
    return truncateText(JSON.stringify(input, null, 2), maxChars);
  } catch {
    return truncateText(String(input), maxChars);
  }
}

function extractMessageText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const textPart = part as { type?: unknown; text?: unknown };
    if (textPart.type !== "text" || typeof textPart.text !== "string") continue;
    const text = textPart.text.trim();
    if (!text) continue;
    texts.push(text);
  }
  return texts.join("\n").trim();
}

function extractAssistantToolSummary(message: SessionMessageV1): string {
  if (!Array.isArray(message.parts)) return "";
  const toolNames = new Set<string>();
  for (const part of message.parts as AnyUiPart[]) {
    if (!part || typeof part !== "object") continue;
    if (!isToolUIPart(part)) continue;
    const toolName = String(getToolName(part) || "").trim();
    if (toolName) toolNames.add(toolName);
  }
  if (toolNames.size === 0) return "";
  return `[tool] ${Array.from(toolNames).join(", ")}`;
}

/**
 * 解析单条 session 消息的用户可见预览文本。
 */
export function resolveSessionMessagePreview(message: SessionMessageV1): string {
  const plainText = extractMessageText(message.parts);
  if (plainText) return plainText;
  if (message.role !== "assistant") return "";

  const userVisible = pickLastSuccessfulChatSendText(message).trim();
  if (userVisible) return userVisible;
  return extractAssistantToolSummary(message);
}

/**
 * 推导当前 session 的可读标题。
 */
export function resolveSessionTitle(messages: SessionMessageV1[]): string | undefined {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const preview = resolveSessionMessagePreview(message);
    if (!preview) continue;
    return truncateText(preview, 80);
  }
  const fallback = messages[0] ? resolveSessionMessagePreview(messages[0]) : "";
  return fallback ? truncateText(fallback, 80) : undefined;
}

function resolveToolName(part: ToolPartCompatShape, aiToolName?: string): string {
  const fromAi = String(aiToolName || "").trim();
  if (fromAi) return fromAi;
  const rawType = typeof part.type === "string" ? part.type.trim() : "";
  if (rawType.startsWith("tool-")) return rawType.slice("tool-".length);
  return "unknown_tool";
}

function extractToolCallInput(part: ToolPartCompatShape): unknown {
  return part.input ?? undefined;
}

function extractToolResultOutput(part: ToolPartCompatShape): unknown {
  const state = typeof part.state === "string" ? part.state.trim() : "";
  if (state === "output-available") return part.output;
  if (state === "output-error") {
    return { error: part.errorText ?? part.error ?? "tool_error" };
  }
  if (state === "output-denied") {
    return {
      error: "tool_denied",
      reason: part.approval?.reason ?? "",
    };
  }
  return undefined;
}

function toTimelineEvent(params: {
  message: SessionMessageV1;
  role: AgentSessionTimelineEvent["role"];
  text: string;
  sequence: number;
  toolName?: string;
}): AgentSessionTimelineEvent {
  const metadata = (params.message.metadata || null) as SessionMetadataV1 | null;
  return {
    id: `${String(params.message.id || "")}:${params.sequence}`,
    role: params.role,
    ...(typeof metadata?.ts === "number" ? { ts: metadata.ts } : {}),
    ...(typeof metadata?.kind === "string" ? { kind: metadata.kind } : {}),
    ...(typeof metadata?.source === "string" ? { source: metadata.source } : {}),
    text: params.text,
    ...(params.toolName ? { toolName: params.toolName } : {}),
  };
}

/**
 * 把单条 session message 展平成时间线事件。
 */
export function toSessionTimelineEvents(
  message: SessionMessageV1,
): AgentSessionTimelineEvent[] {
  if (message.role !== "assistant") {
    return [
      toTimelineEvent({
        message,
        role: message.role === "user" ? "user" : "assistant",
        text: resolveSessionMessagePreview(message),
        sequence: 0,
      }),
    ];
  }

  const parts = Array.isArray(message.parts)
    ? (message.parts as AnyUiPart[])
    : [];
  const events: AgentSessionTimelineEvent[] = [];
  let sequence = 0;

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const partObject = part as ToolPartCompatShape;

    if (isTextUIPart(part)) {
      const text = String(part.text || "").trim();
      if (!text) continue;
      events.push(
        toTimelineEvent({
          message,
          role: "assistant",
          text,
          sequence,
        }),
      );
      sequence += 1;
      continue;
    }

    if (isToolUIPart(part)) {
      const toolName = resolveToolName(partObject, String(getToolName(part) || ""));
      const inputText = stringifyForDisplay(extractToolCallInput(partObject));
      events.push(
        toTimelineEvent({
          message,
          role: "tool-call",
          text: inputText || "(empty)",
          sequence,
          toolName,
        }),
      );
      sequence += 1;

      const output = extractToolResultOutput(partObject);
      if (output !== undefined) {
        events.push(
          toTimelineEvent({
            message,
            role: "tool-result",
            text: stringifyForDisplay(output) || "(empty)",
            sequence,
            toolName,
          }),
        );
        sequence += 1;
      }
    }
  }

  if (events.length === 0) {
    events.push(
      toTimelineEvent({
        message,
        role: "assistant",
        text: resolveSessionMessagePreview(message),
        sequence: 0,
      }),
    );
  }

  return events;
}

/**
 * 读取指定 JSONL 消息文件。
 */
export async function loadSessionMessagesFromPath(
  filePath: string,
): Promise<SessionMessageV1[]> {
  if (!(await fs.pathExists(filePath))) return [];
  const raw = await fs.readFile(filePath, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const messages: SessionMessageV1[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as SessionMessageV1;
      if (!parsed || typeof parsed !== "object") continue;
      if (parsed.role !== "user" && parsed.role !== "assistant") continue;
      messages.push(parsed);
    } catch {
      // 关键点（中文）：单行损坏不影响整个 session 的可读性。
    }
  }
  return messages;
}

/**
 * 基于 metadata + messages 构建 SDK session 详情。
 */
export function buildSessionInfo(
  input: SessionBrowseBaseInput,
): AgentSessionInfo {
  const previewText = input.messages.length > 0
    ? truncateText(
        resolveSessionMessagePreview(input.messages[input.messages.length - 1]),
        180,
      )
    : undefined;
  const title = resolveSessionTitle(input.messages);
  return {
    agentId: input.agentId,
    sessionId: input.sessionId,
    ...(title ? { title } : {}),
    ...(previewText ? { previewText } : {}),
    messageCount: input.messages.length,
    ...(typeof input.metadata.createdAt === "number"
      ? { createdAt: input.metadata.createdAt }
      : {}),
    ...(typeof input.metadata.updatedAt === "number"
      ? { updatedAt: input.metadata.updatedAt }
      : {}),
    ...(input.metadata.sdkConfig?.modelLabel
      ? { modelLabel: input.metadata.sdkConfig.modelLabel }
      : {}),
    ...(typeof input.metadata.timezone === "string" && input.metadata.timezone.trim()
      ? { timezone: input.metadata.timezone.trim() }
      : {}),
    ...(input.executing ? { executing: true } : {}),
  };
}

/**
 * 基于完整消息列表构建 session history 分页结果。
 */
export function buildSessionHistoryPage(params: {
  session: AgentSessionInfo;
  messages: SessionMessageV1[];
  input?: AgentSessionHistoryInput;
}): AgentSessionHistoryPage {
  const view: AgentSessionHistoryView = params.input?.view || "message";
  const order = params.input?.order || "asc";
  const limit = normalizeLimit(params.input?.limit, 50, 500);
  const cursor = normalizeCursor(params.input?.cursor);

  if (view === "timeline") {
    const allEvents = params.messages.flatMap((message) => toSessionTimelineEvents(message));
    const orderedEvents = order === "desc" ? [...allEvents].reverse() : allEvents;
    const pageItems = orderedEvents.slice(cursor, cursor + limit);
    const nextOffset = cursor + pageItems.length;
    return {
      session: params.session,
      view,
      items: pageItems,
      total: orderedEvents.length,
      ...(nextOffset < orderedEvents.length
        ? { nextCursor: encodeCursor(nextOffset) }
        : {}),
      hasMore: nextOffset < orderedEvents.length,
    };
  }

  const orderedMessages =
    order === "desc" ? [...params.messages].reverse() : [...params.messages];
  const pageItems = orderedMessages.slice(cursor, cursor + limit);
  const nextOffset = cursor + pageItems.length;
  return {
    session: params.session,
    view,
    items: pageItems,
    total: orderedMessages.length,
    ...(nextOffset < orderedMessages.length
      ? { nextCursor: encodeCursor(nextOffset) }
      : {}),
    hasMore: nextOffset < orderedMessages.length,
  };
}

/**
 * 列出指定 agent 的 session 摘要页。
 */
export async function listAgentSessionSummaryPage(params: {
  projectRoot: string;
  agentId: string;
  input?: AgentListSessionsInput;
  executingSessionIds?: Set<string>;
}): Promise<AgentSessionSummaryPage> {
  const limit = normalizeLimit(params.input?.limit, 50, 500);
  const cursor = normalizeCursor(params.input?.cursor);
  const query = String(params.input?.query || "").trim().toLowerCase();
  const sessionsRoot = getSdkAgentSessionsRootDirPath(
    params.projectRoot,
    params.agentId,
  );

  if (!(await fs.pathExists(sessionsRoot))) {
    return {
      items: [],
      total: 0,
      hasMore: false,
    };
  }

  const entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
  const summaries: AgentSessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionId = decodeMaybe(entry.name);
    if (!sessionId) continue;
    const metadata = await readSessionMetadata({
      projectRoot: params.projectRoot,
      agentId: params.agentId,
      sessionId,
    });
    const messages = await loadSessionMessagesFromPath(
      getSdkAgentSessionMessagesPath(params.projectRoot, params.agentId, sessionId),
    );
    const info = buildSessionInfo({
      projectRoot: params.projectRoot,
      agentId: params.agentId,
      sessionId,
      metadata,
      messages,
      executing: params.executingSessionIds?.has(sessionId),
    });
    const summary: AgentSessionSummary = {
      agentId: info.agentId,
      sessionId: info.sessionId,
      ...(info.title ? { title: info.title } : {}),
      ...(info.previewText ? { previewText: info.previewText } : {}),
      messageCount: info.messageCount,
      ...(typeof info.createdAt === "number" ? { createdAt: info.createdAt } : {}),
      ...(typeof info.updatedAt === "number" ? { updatedAt: info.updatedAt } : {}),
      ...(info.modelLabel ? { modelLabel: info.modelLabel } : {}),
      ...(info.executing ? { executing: true } : {}),
    };

    if (query) {
      const haystack = [
        summary.sessionId,
        summary.title || "",
        summary.previewText || "",
      ]
        .join("\n")
        .toLowerCase();
      if (!haystack.includes(query)) continue;
    }

    summaries.push(summary);
  }

  summaries.sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));

  const items = summaries.slice(cursor, cursor + limit);
  const nextOffset = cursor + items.length;
  return {
    items,
    total: summaries.length,
    ...(nextOffset < summaries.length
      ? { nextCursor: encodeCursor(nextOffset) }
      : {}),
    hasMore: nextOffset < summaries.length,
  };
}
