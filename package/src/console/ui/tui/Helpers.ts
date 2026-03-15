/**
 * TUI API helpers.
 *
 * 关键点（中文）
 * - 聚合 TUI 路由复用的纯函数与数据读取逻辑。
 * - 不注册任何 HTTP 路由，只提供可测试的 helper。
 */

import fs from "fs-extra";
import path from "node:path";
import {
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type UIMessagePart,
} from "ai";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@agent/types/ContextMessage.js";
import type { JsonObject } from "@/types/Json.js";
import type { RuntimeState } from "@/agent/context/manager/RuntimeState.js";
import {
  getLogsDirPath,
  getShipContextMessagesPath,
  getShipContextRootDirPath,
  getShipTasksDirPath,
} from "@/console/env/Paths.js";
import { resolveTaskIdByTitle } from "@services/task/runtime/Store.js";
import { pickLastSuccessfulChatSendText } from "@services/chat/runtime/UserVisibleText.js";
import { extractToolCallsFromUiMessage } from "@services/chat/runtime/UIMessageTransformer.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
export const TASK_RUN_DIR_REGEX = /^\d{8}-\d{6}-\d{3}$/;

type TuiMessageRole =
  | "user"
  | "assistant"
  | "tool-call"
  | "tool-result"
  | "system";

type AnyUiPart = UIMessagePart<Record<string, never>, Record<string, never>>;

type ToolPartCompatShape = {
  type?: unknown;
  toolName?: unknown;
  tool?: unknown;
  state?: unknown;
  input?: unknown;
  rawInput?: unknown;
  arguments?: unknown;
  output?: unknown;
  result?: unknown;
  errorText?: unknown;
  error?: unknown;
  approval?: { reason?: unknown } | null;
};

export type TuiTimelineEvent = {
  id: string;
  role: TuiMessageRole;
  ts?: number;
  kind?: string;
  source?: string;
  text: string;
  toolName?: string;
};

export type TuiContextSummary = {
  contextId: string;
  messageCount: number;
  updatedAt?: number;
  lastRole?: "user" | "assistant" | "system";
  lastText?: string;
};

export type TuiLogEntry = {
  timestamp?: string;
  type?: string;
  level?: string;
  message?: string;
  details?: JsonObject;
};

export type TuiTaskRunSummary = {
  timestamp: string;
  status?: string;
  executionStatus?: string;
  resultStatus?: string;
  inProgress?: boolean;
  progressPhase?: string;
  progressMessage?: string;
  progressUpdatedAt?: number;
  progressRound?: number;
  progressMaxRounds?: number;
  startedAt?: number;
  endedAt?: number;
  dialogueRounds?: number;
  userSimulatorSatisfied?: boolean;
  error?: string;
  runDirRel: string;
};

export type TuiTaskRunDetail = {
  title: string;
  timestamp: string;
  runDirRel: string;
  meta?: Record<string, unknown>;
  progress?: {
    status?: string;
    phase?: string;
    message?: string;
    startedAt?: number;
    updatedAt?: number;
    endedAt?: number;
    round?: number;
    maxRounds?: number;
    runStatus?: string;
    executionStatus?: string;
    resultStatus?: string;
    events?: Array<{
      at?: number;
      phase?: string;
      message?: string;
      round?: number;
      maxRounds?: number;
    }>;
  };
  dialogue?: Record<string, unknown>;
  artifacts: {
    input?: string;
    output?: string;
    result?: string;
    dialogue?: string;
    error?: string;
  };
  messages: TuiTimelineEvent[];
};

export function toLimit(
  raw: string | undefined,
  fallback = DEFAULT_LIMIT,
): number {
  const n = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, n));
}

export function toOptionalString(input: unknown): string | undefined {
  const value = typeof input === "string" ? input.trim() : "";
  return value ? value : undefined;
}

function truncateText(text: string, maxChars: number): string {
  const normalized = String(text || "");
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, Math.max(0, maxChars - 3)) + "...";
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

export function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function extractMessageText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const p = part as { type?: unknown; text?: unknown };
    if (p.type !== "text") continue;
    if (typeof p.text !== "string") continue;
    const value = p.text.trim();
    if (!value) continue;
    texts.push(value);
  }
  return texts.join("\n").trim();
}

function extractAssistantToolSummary(message: ContextMessageV1): string {
  const toolCalls = extractToolCallsFromUiMessage(message);
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return "";
  const toolNames = Array.from(
    new Set(
      toolCalls.map((item) => String(item.tool || "").trim()).filter(Boolean),
    ),
  );
  if (toolNames.length === 0) return "";
  return `[tool] ${toolNames.join(", ")}`;
}

function resolveToolName(
  part: ToolPartCompatShape,
  aiToolName?: string,
): string {
  const fromAi = String(aiToolName || "").trim();
  if (fromAi) return fromAi;

  const fromField =
    typeof part.toolName === "string" ? part.toolName.trim() : "";
  if (fromField) return fromField;

  const fromTool = typeof part.tool === "string" ? part.tool.trim() : "";
  if (fromTool) return fromTool;

  const rawType = typeof part.type === "string" ? part.type.trim() : "";
  if (
    rawType.startsWith("tool-") &&
    rawType !== "tool-call" &&
    rawType !== "tool-result" &&
    rawType !== "tool-error" &&
    rawType !== "tool-approval-request"
  ) {
    return rawType.slice("tool-".length);
  }
  return "unknown_tool";
}

function extractToolCallInput(part: ToolPartCompatShape): unknown {
  return part.input ?? part.rawInput ?? part.arguments ?? undefined;
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
  if (
    state === "input-available" ||
    state === "input-streaming" ||
    state === "output-streaming"
  ) {
    return undefined;
  }
  if (part.type === "tool-result" || part.type === "tool-error") {
    return part.result ?? part.output ?? part.errorText ?? part.error ?? "";
  }
  return undefined;
}

function toUiMessageEvent(params: {
  message: ContextMessageV1;
  role: TuiMessageRole;
  text: string;
  sequence: number;
  toolName?: string;
}): TuiTimelineEvent {
  const { message, role, text, sequence, toolName } = params;
  const metadata = (message.metadata || null) as ContextMetadataV1 | null;

  return {
    id: `${String(message.id || "")}:${sequence}`,
    role,
    ...(typeof metadata?.ts === "number" ? { ts: metadata.ts } : {}),
    ...(typeof metadata?.kind === "string" ? { kind: metadata.kind } : {}),
    ...(typeof metadata?.source === "string"
      ? { source: metadata.source }
      : {}),
    text,
    ...(toolName ? { toolName } : {}),
  };
}

/**
 * 提取 TUI 展示文本（用户可见优先）。
 *
 * 关键点（中文）
 * - assistant 可能是 tool-only 消息，`parts.text` 为空。
 * - 先尝试 `chat_send` 可见文本，再回退到工具摘要，避免界面出现整屏空白。
 */
function resolveUiMessageText(message: ContextMessageV1): string {
  const plainText = extractMessageText(message.parts);
  if (plainText) return plainText;

  if (message.role !== "assistant") return "";

  const userVisible = pickLastSuccessfulChatSendText(message).trim();
  if (userVisible) return userVisible;

  return extractAssistantToolSummary(message);
}

export function toUiMessageTimeline(
  message: ContextMessageV1,
): TuiTimelineEvent[] {
  if (message.role !== "assistant") {
    return [
      toUiMessageEvent({
        message,
        role: message.role,
        text: resolveUiMessageText(message),
        sequence: 0,
      }),
    ];
  }

  const parts = Array.isArray(message.parts)
    ? (message.parts as AnyUiPart[])
    : [];
  const events: TuiTimelineEvent[] = [];
  let sequence = 0;

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const partObject = part as ToolPartCompatShape;

    if (isTextUIPart(part)) {
      const text = String(part.text || "").trim();
      if (!text) continue;
      events.push(
        toUiMessageEvent({
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
      const toolName = resolveToolName(
        partObject,
        String(getToolName(part) || ""),
      );
      const inputText = stringifyForDisplay(extractToolCallInput(partObject));
      events.push(
        toUiMessageEvent({
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
          toUiMessageEvent({
            message,
            role: "tool-result",
            text: stringifyForDisplay(output) || "(empty)",
            sequence,
            toolName,
          }),
        );
        sequence += 1;
      }
      continue;
    }

    const legacyType =
      typeof partObject.type === "string" ? partObject.type.trim() : "";
    if (legacyType === "tool-call") {
      const toolName = resolveToolName(partObject);
      events.push(
        toUiMessageEvent({
          message,
          role: "tool-call",
          text:
            stringifyForDisplay(extractToolCallInput(partObject)) || "(empty)",
          sequence,
          toolName,
        }),
      );
      sequence += 1;
      continue;
    }

    if (legacyType === "tool-result" || legacyType === "tool-error") {
      const toolName = resolveToolName(partObject);
      events.push(
        toUiMessageEvent({
          message,
          role: "tool-result",
          text:
            stringifyForDisplay(extractToolResultOutput(partObject)) ||
            "(empty)",
          sequence,
          toolName,
        }),
      );
      sequence += 1;
    }
  }

  // 关键点（中文）：assistant 若没有文本 part，也要保留一条可见事件，避免 TUI 空白。
  if (events.length === 0) {
    events.push(
      toUiMessageEvent({
        message,
        role: "assistant",
        text: resolveUiMessageText(message),
        sequence: 0,
      }),
    );
  }

  return events;
}

export async function loadContextMessagesFromFile(
  filePath: string,
): Promise<ContextMessageV1[]> {
  if (!(await fs.pathExists(filePath))) return [];
  const raw = await fs.readFile(filePath, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const out: ContextMessageV1[] = [];
  for (const line of lines) {
    try {
      const item = JSON.parse(line) as ContextMessageV1;
      if (!item || typeof item !== "object") continue;
      if (item.role !== "user" && item.role !== "assistant") continue;
      out.push(item);
    } catch {
      // 关键点（中文）：单行损坏不应影响整体可读性。
    }
  }
  return out;
}

export async function listContextSummaries(params: {
  projectRoot: string;
  limit: number;
}): Promise<TuiContextSummary[]> {
  const rootDir = getShipContextRootDirPath(params.projectRoot);
  if (!(await fs.pathExists(rootDir))) return [];

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const items: TuiContextSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const contextId = decodeMaybe(entry.name);
    if (!contextId) continue;

    const filePath = getShipContextMessagesPath(params.projectRoot, contextId);
    const messages = await loadContextMessagesFromFile(filePath);
    const last = messages.at(-1);
    const lastTs =
      typeof last?.metadata?.ts === "number" ? last.metadata.ts : undefined;
    const stat = await fs
      .stat(filePath)
      .then((s) => s)
      .catch(() => null);
    const updatedAt = lastTs || (stat ? stat.mtimeMs : undefined);

    items.push({
      contextId,
      messageCount: messages.length,
      ...(typeof updatedAt === "number" ? { updatedAt } : {}),
      ...(last?.role ? { lastRole: last.role } : {}),
      ...(last
        ? { lastText: truncateText(resolveUiMessageText(last), 180) }
        : {}),
    });
  }

  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return items.slice(0, params.limit);
}

export async function readRecentLogs(params: {
  projectRoot: string;
  limit: number;
}): Promise<TuiLogEntry[]> {
  const logsDir = getLogsDirPath(params.projectRoot);
  if (!(await fs.pathExists(logsDir))) return [];

  const files = (await fs.readdir(logsDir, { withFileTypes: true }))
    .filter((x) => x.isFile() && x.name.endsWith(".jsonl"))
    .map((x) => x.name)
    .sort()
    .reverse();

  const out: TuiLogEntry[] = [];

  for (const fileName of files) {
    if (out.length >= params.limit) break;
    const abs = path.join(logsDir, fileName);
    const raw = await fs.readFile(abs, "utf-8").catch(() => "");
    const lines = raw.split("\n").filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (out.length >= params.limit) break;
      try {
        const parsed = JSON.parse(lines[index]) as TuiLogEntry;
        if (!parsed || typeof parsed !== "object") continue;
        out.push({
          ...(typeof parsed.timestamp === "string"
            ? { timestamp: parsed.timestamp }
            : {}),
          ...(typeof parsed.type === "string" ? { type: parsed.type } : {}),
          ...(typeof parsed.level === "string" ? { level: parsed.level } : {}),
          ...(typeof parsed.message === "string"
            ? { message: parsed.message }
            : {}),
          ...(parsed.details && typeof parsed.details === "object"
            ? { details: parsed.details }
            : {}),
        });
      } catch {
        // ignore
      }
    }
  }

  return out;
}

async function resolveTaskDir(projectRoot: string, title: string): Promise<string> {
  const taskId = await resolveTaskIdByTitle({ projectRoot, title });
  return path.join(getShipTasksDirPath(projectRoot), taskId);
}

export async function listTaskRuns(params: {
  projectRoot: string;
  title: string;
  limit: number;
}): Promise<TuiTaskRunSummary[]> {
  const taskDir = await resolveTaskDir(params.projectRoot, params.title);
  if (!(await fs.pathExists(taskDir))) return [];

  const entries = await fs.readdir(taskDir, { withFileTypes: true });
  const timestamps = entries
    .filter((x) => x.isDirectory() && TASK_RUN_DIR_REGEX.test(x.name))
    .map((x) => x.name)
    .sort()
    .reverse()
    .slice(0, params.limit);

  const out: TuiTaskRunSummary[] = [];

  for (const timestamp of timestamps) {
    const runDir = path.join(taskDir, timestamp);
    const metaPath = path.join(runDir, "run.json");
    const progressPath = path.join(runDir, "run-progress.json");
    const runDirRel = path
      .relative(params.projectRoot, runDir)
      .split(path.sep)
      .join("/");
    const meta = (await fs.readJson(metaPath).catch(() => null)) as {
      status?: string;
      executionStatus?: string;
      resultStatus?: string;
      startedAt?: number;
      endedAt?: number;
      dialogueRounds?: number;
      userSimulatorSatisfied?: boolean;
      error?: string;
    } | null;
    const progress = (await fs.readJson(progressPath).catch(() => null)) as {
      status?: string;
      phase?: string;
      message?: string;
      updatedAt?: number;
      round?: number;
      maxRounds?: number;
    } | null;

    const progressStatus =
      typeof progress?.status === "string" ? progress.status : undefined;
    const inProgress =
      progressStatus === "running" ||
      (!meta && (await fs.pathExists(progressPath)));
    const displayStatus =
      inProgress
        ? "running"
        : typeof meta?.status === "string"
          ? meta.status
          : progressStatus;

    out.push({
      timestamp,
      ...(typeof displayStatus === "string" ? { status: displayStatus } : {}),
      ...(typeof meta?.executionStatus === "string"
        ? { executionStatus: meta.executionStatus }
        : {}),
      ...(typeof meta?.resultStatus === "string"
        ? { resultStatus: meta.resultStatus }
        : {}),
      ...(inProgress ? { inProgress: true } : {}),
      ...(typeof progress?.phase === "string"
        ? { progressPhase: progress.phase }
        : {}),
      ...(typeof progress?.message === "string"
        ? { progressMessage: progress.message }
        : {}),
      ...(typeof progress?.updatedAt === "number"
        ? { progressUpdatedAt: progress.updatedAt }
        : {}),
      ...(typeof progress?.round === "number"
        ? { progressRound: progress.round }
        : {}),
      ...(typeof progress?.maxRounds === "number"
        ? { progressMaxRounds: progress.maxRounds }
        : {}),
      ...(typeof meta?.startedAt === "number"
        ? { startedAt: meta.startedAt }
        : {}),
      ...(typeof meta?.endedAt === "number" ? { endedAt: meta.endedAt } : {}),
      ...(typeof meta?.dialogueRounds === "number"
        ? { dialogueRounds: meta.dialogueRounds }
        : {}),
      ...(typeof meta?.userSimulatorSatisfied === "boolean"
        ? { userSimulatorSatisfied: meta.userSimulatorSatisfied }
        : {}),
      ...(typeof meta?.error === "string" ? { error: meta.error } : {}),
      runDirRel,
    });
  }

  return out;
}

export async function readTaskRunDetail(params: {
  projectRoot: string;
  title: string;
  timestamp: string;
}): Promise<TuiTaskRunDetail | null> {
  const taskDir = await resolveTaskDir(params.projectRoot, params.title);
  const runDir = path.join(
    taskDir,
    params.timestamp,
  );
  if (!(await fs.pathExists(runDir))) return null;

  const readText = async (
    name: string,
    maxChars = 80_000,
  ): Promise<string | undefined> => {
    const abs = path.join(runDir, name);
    if (!(await fs.pathExists(abs))) return undefined;
    const raw = await fs.readFile(abs, "utf-8").catch(() => "");
    return truncateText(raw, maxChars);
  };

  const readJson = async <T>(name: string): Promise<T | undefined> => {
    const abs = path.join(runDir, name);
    if (!(await fs.pathExists(abs))) return undefined;
    return (await fs.readJson(abs).catch(() => undefined)) as T | undefined;
  };

  const messagesPath = path.join(runDir, "messages.jsonl");
  const messages = await loadContextMessagesFromFile(messagesPath);
  const progress = await readJson<{
    status?: string;
    phase?: string;
    message?: string;
    startedAt?: number;
    updatedAt?: number;
    endedAt?: number;
    round?: number;
    maxRounds?: number;
    runStatus?: string;
    executionStatus?: string;
    resultStatus?: string;
    events?: Array<{
      at?: number;
      phase?: string;
      message?: string;
      round?: number;
      maxRounds?: number;
    }>;
  }>("run-progress.json");
  const outputText = (await readText("output.md")) || (await readText("result.md"));

  return {
    title: params.title,
    timestamp: params.timestamp,
    runDirRel: path
      .relative(params.projectRoot, runDir)
      .split(path.sep)
      .join("/"),
    meta: await readJson<Record<string, unknown>>("run.json"),
    ...(progress ? { progress } : {}),
    dialogue: await readJson<Record<string, unknown>>("dialogue.json"),
    artifacts: {
      input: await readText("input.md"),
      output: outputText,
      result: await readText("result.md"),
      dialogue: await readText("dialogue.md"),
      error: await readText("error.md"),
    },
    messages: messages
      .slice(-120)
      .flatMap((message) => toUiMessageTimeline(message)),
  };
}

export async function executeByContextId(params: {
  runtime: RuntimeState;
  contextId: string;
  instructions: string;
}) {
  const contextId = String(params.contextId || "").trim();
  const instructions = String(params.instructions || "").trim();
  if (!contextId) throw new Error("Missing contextId");
  if (!instructions) throw new Error("Missing instructions");

  await params.runtime.contextManager.appendUserMessage({
    contextId,
    text: instructions,
  });

  const result = await params.runtime.contextManager.run({
    contextId,
    query: instructions,
  });

  const userVisible = pickLastSuccessfulChatSendText(result.assistantMessage);
  try {
    await params.runtime.contextManager.appendAssistantMessage({
      contextId,
      message: result.assistantMessage,
      fallbackText: userVisible,
      extra: {
        via: "tui_context_execute",
        note: "assistant_message_missing",
      },
    });
  } catch {
    // ignore
  }

  return {
    ...result,
    userVisible,
  };
}
