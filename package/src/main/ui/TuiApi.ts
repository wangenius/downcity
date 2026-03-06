/**
 * TUI API（WebUI 数据面板接口）。
 *
 * 关键点（中文）
 * - 面向内置 Web UI，提供 context/messages/services/tasks/logs 的只读与少量操作接口。
 * - 所有接口统一挂在 `/api/tui/*`，便于 WebUI 代理层一次性转发。
 * - 数据来源优先使用现有运行时与落盘文件，不引入额外状态存储。
 */

import fs from "fs-extra";
import path from "node:path";
import type { Hono } from "hono";
import { getToolName, isTextUIPart, isToolUIPart, type UIMessagePart } from "ai";
import type { ContextMessageV1, ContextMetadataV1 } from "@main/types/ContextMessage.js";
import type { JsonObject } from "@/types/Json.js";
import {
  getLogsDirPath,
  getShipContextMessagesPath,
  getShipContextRootDirPath,
  getShipTasksDirPath,
} from "@/main/runtime/Paths.js";
import {
  listServiceRuntimes,
  runServiceCommand,
} from "@main/service/Manager.js";
import type { RuntimeState } from "@main/runtime/RuntimeState.js";
import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import { listTaskDefinitions } from "@services/task/Action.js";
import { isValidTaskId } from "@services/task/runtime/Paths.js";
import { pickLastSuccessfulChatSendText } from "@services/chat/runtime/UserVisibleText.js";
import { extractToolCallsFromUiMessage } from "@services/chat/runtime/UIMessageTransformer.js";
import { withRequestContext } from "@main/runtime/RequestContext.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const TASK_RUN_DIR_REGEX = /^\d{8}-\d{6}-\d{3}$/;
type TuiMessageRole = "user" | "assistant" | "tool-call" | "tool-result" | "system";
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

function toLimit(raw: string | undefined, fallback = DEFAULT_LIMIT): number {
  const n = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, n));
}

function toOptionalString(input: unknown): string | undefined {
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

function decodeMaybe(value: string): string {
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
  const toolNames = Array.from(new Set(toolCalls.map((item) => String(item.tool || "").trim()).filter(Boolean)));
  if (toolNames.length === 0) return "";
  return `[tool] ${toolNames.join(", ")}`;
}

function resolveToolName(part: ToolPartCompatShape, aiToolName?: string): string {
  const fromAi = String(aiToolName || "").trim();
  if (fromAi) return fromAi;
  const fromField = typeof part.toolName === "string" ? part.toolName.trim() : "";
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
  if (state === "input-available" || state === "input-streaming" || state === "output-streaming") {
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
}): {
  id: string;
  role: TuiMessageRole;
  ts?: number;
  kind?: string;
  source?: string;
  text: string;
  toolName?: string;
} {
  const { message, role, text, sequence, toolName } = params;
  const metadata = (message.metadata || null) as ContextMetadataV1 | null;
  return {
    id: `${String(message.id || "")}:${sequence}`,
    role,
    ...(typeof metadata?.ts === "number" ? { ts: metadata.ts } : {}),
    ...(typeof metadata?.kind === "string" ? { kind: metadata.kind } : {}),
    ...(typeof metadata?.source === "string" ? { source: metadata.source } : {}),
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

function toUiMessageTimeline(message: ContextMessageV1): Array<{
  id: string;
  role: TuiMessageRole;
  ts?: number;
  kind?: string;
  source?: string;
  text: string;
  toolName?: string;
}> {
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

  const parts = Array.isArray(message.parts) ? (message.parts as AnyUiPart[]) : [];
  const events: Array<{
    id: string;
    role: TuiMessageRole;
    ts?: number;
    kind?: string;
    source?: string;
    text: string;
    toolName?: string;
  }> = [];
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
      const toolName = resolveToolName(partObject, String(getToolName(part) || ""));
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

    const legacyType = typeof partObject.type === "string" ? partObject.type.trim() : "";
    if (legacyType === "tool-call") {
      const toolName = resolveToolName(partObject);
      events.push(
        toUiMessageEvent({
          message,
          role: "tool-call",
          text: stringifyForDisplay(extractToolCallInput(partObject)) || "(empty)",
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
          text: stringifyForDisplay(extractToolResultOutput(partObject)) || "(empty)",
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

async function loadContextMessagesFromFile(filePath: string): Promise<ContextMessageV1[]> {
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

async function listContextSummaries(params: {
  projectRoot: string;
  limit: number;
}): Promise<
  Array<{
    contextId: string;
    messageCount: number;
    updatedAt?: number;
    lastRole?: "user" | "assistant" | "system";
    lastText?: string;
  }>
> {
  const rootDir = getShipContextRootDirPath(params.projectRoot);
  if (!(await fs.pathExists(rootDir))) return [];

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const items: Array<{
    contextId: string;
    messageCount: number;
    updatedAt?: number;
    lastRole?: "user" | "assistant" | "system";
    lastText?: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const contextId = decodeMaybe(entry.name);
    if (!contextId) continue;

    const filePath = getShipContextMessagesPath(params.projectRoot, contextId);
    const messages = await loadContextMessagesFromFile(filePath);
    const last = messages.at(-1);
    const lastTs =
      typeof last?.metadata?.ts === "number"
        ? last.metadata.ts
        : undefined;
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
      ...(last ? { lastText: truncateText(resolveUiMessageText(last), 180) } : {}),
    });
  }

  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return items.slice(0, params.limit);
}

async function readRecentLogs(params: {
  projectRoot: string;
  limit: number;
}): Promise<
  Array<{
    timestamp?: string;
    type?: string;
    level?: string;
    message?: string;
    details?: JsonObject;
  }>
> {
  const logsDir = getLogsDirPath(params.projectRoot);
  if (!(await fs.pathExists(logsDir))) return [];

  const files = (await fs.readdir(logsDir, { withFileTypes: true }))
    .filter((x) => x.isFile() && x.name.endsWith(".jsonl"))
    .map((x) => x.name)
    .sort()
    .reverse();

  const out: Array<{
    timestamp?: string;
    type?: string;
    level?: string;
    message?: string;
    details?: JsonObject;
  }> = [];

  for (const fileName of files) {
    if (out.length >= params.limit) break;
    const abs = path.join(logsDir, fileName);
    const raw = await fs.readFile(abs, "utf-8").catch(() => "");
    const lines = raw.split("\n").filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (out.length >= params.limit) break;
      try {
        const parsed = JSON.parse(lines[index]) as {
          timestamp?: string;
          type?: string;
          level?: string;
          message?: string;
          details?: JsonObject;
        };
        if (!parsed || typeof parsed !== "object") continue;
        out.push({
          ...(typeof parsed.timestamp === "string" ? { timestamp: parsed.timestamp } : {}),
          ...(typeof parsed.type === "string" ? { type: parsed.type } : {}),
          ...(typeof parsed.level === "string" ? { level: parsed.level } : {}),
          ...(typeof parsed.message === "string" ? { message: parsed.message } : {}),
          ...(parsed.details && typeof parsed.details === "object" ? { details: parsed.details } : {}),
        });
      } catch {
        // ignore
      }
    }
  }

  return out;
}

function resolveTaskDir(projectRoot: string, taskId: string): string {
  return path.join(getShipTasksDirPath(projectRoot), taskId);
}

async function listTaskRuns(params: {
  projectRoot: string;
  taskId: string;
  limit: number;
}): Promise<
  Array<{
    timestamp: string;
    status?: string;
    executionStatus?: string;
    resultStatus?: string;
    startedAt?: number;
    endedAt?: number;
    dialogueRounds?: number;
    userSimulatorSatisfied?: boolean;
    error?: string;
    runDirRel: string;
  }>
> {
  const taskDir = resolveTaskDir(params.projectRoot, params.taskId);
  if (!(await fs.pathExists(taskDir))) return [];

  const entries = await fs.readdir(taskDir, { withFileTypes: true });
  const timestamps = entries
    .filter((x) => x.isDirectory() && TASK_RUN_DIR_REGEX.test(x.name))
    .map((x) => x.name)
    .sort()
    .reverse()
    .slice(0, params.limit);

  const out: Array<{
    timestamp: string;
    status?: string;
    executionStatus?: string;
    resultStatus?: string;
    startedAt?: number;
    endedAt?: number;
    dialogueRounds?: number;
    userSimulatorSatisfied?: boolean;
    error?: string;
    runDirRel: string;
  }> = [];

  for (const timestamp of timestamps) {
    const runDir = path.join(taskDir, timestamp);
    const metaPath = path.join(runDir, "run.json");
    const runDirRel = path
      .relative(params.projectRoot, runDir)
      .split(path.sep)
      .join("/");
    const meta = await fs
      .readJson(metaPath)
      .catch(() => null) as {
      status?: string;
      executionStatus?: string;
      resultStatus?: string;
      startedAt?: number;
      endedAt?: number;
      dialogueRounds?: number;
      userSimulatorSatisfied?: boolean;
      error?: string;
    } | null;

    out.push({
      timestamp,
      ...(typeof meta?.status === "string" ? { status: meta.status } : {}),
      ...(typeof meta?.executionStatus === "string"
        ? { executionStatus: meta.executionStatus }
        : {}),
      ...(typeof meta?.resultStatus === "string" ? { resultStatus: meta.resultStatus } : {}),
      ...(typeof meta?.startedAt === "number" ? { startedAt: meta.startedAt } : {}),
      ...(typeof meta?.endedAt === "number" ? { endedAt: meta.endedAt } : {}),
      ...(typeof meta?.dialogueRounds === "number" ? { dialogueRounds: meta.dialogueRounds } : {}),
      ...(typeof meta?.userSimulatorSatisfied === "boolean"
        ? { userSimulatorSatisfied: meta.userSimulatorSatisfied }
        : {}),
      ...(typeof meta?.error === "string" ? { error: meta.error } : {}),
      runDirRel,
    });
  }

  return out;
}

async function readTaskRunDetail(params: {
  projectRoot: string;
  taskId: string;
  timestamp: string;
}) {
  const runDir = path.join(resolveTaskDir(params.projectRoot, params.taskId), params.timestamp);
  if (!(await fs.pathExists(runDir))) return null;

  const readText = async (name: string, maxChars = 80_000): Promise<string | undefined> => {
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

  return {
    taskId: params.taskId,
    timestamp: params.timestamp,
    runDirRel: path.relative(params.projectRoot, runDir).split(path.sep).join("/"),
    meta: await readJson<Record<string, unknown>>("run.json"),
    dialogue: await readJson<Record<string, unknown>>("dialogue.json"),
    artifacts: {
      input: await readText("input.md"),
      output: await readText("output.md"),
      result: await readText("result.md"),
      dialogue: await readText("dialogue.md"),
      error: await readText("error.md"),
    },
    messages: messages.slice(-120).flatMap((message) => toUiMessageTimeline(message)),
  };
}

async function executeByContextId(params: {
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

  const agent = params.runtime.contextManager.getAgent(contextId);
  const runContext =
    await params.runtime.contextManager.createAgentRunContext(contextId);
  const result = await withRequestContext({ contextId }, () =>
    agent.run({
      requestId: runContext.requestId,
      system: runContext.system,
      tools: runContext.tools,
      query: instructions,
    }),
  );

  const userVisible = pickLastSuccessfulChatSendText(result.assistantMessage);
  try {
    const persistor = params.runtime.contextManager.getContextPersistor(
      contextId,
    );
    const assistantMessage = result.assistantMessage;
    if (assistantMessage && typeof assistantMessage === "object") {
      await persistor.append(assistantMessage as ContextMessageV1);
      void params.runtime.contextManager.afterContextUpdatedAsync(contextId);
    } else if (userVisible && userVisible.trim()) {
      const metadata: Omit<ContextMetadataV1, "v" | "ts"> = {
        contextId,
        extra: {
          via: "tui_context_execute",
          note: "assistant_message_missing",
        },
      };
      await persistor.append(
        persistor.createAssistantTextMessage({
          text: userVisible,
          metadata,
          kind: "normal",
          source: "egress",
        }),
      );
      void params.runtime.contextManager.afterContextUpdatedAsync(contextId);
    }
  } catch {
    // ignore
  }

  return {
    ...result,
    userVisible,
  };
}

export function registerTuiApiRoutes(params: {
  app: Hono;
  getRuntimeState: () => RuntimeState;
  getServiceRuntimeState: () => ServiceRuntime;
}): void {
  const app = params.app;

  app.get("/api/tui/overview", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const contextLimit = toLimit(c.req.query("contextLimit"), 20);
      const contexts = await listContextSummaries({
        projectRoot: runtime.rootPath,
        limit: contextLimit,
      });
      const services = listServiceRuntimes();
      const taskResult = await listTaskDefinitions({
        projectRoot: runtime.rootPath,
      });
      const tasks = Array.isArray(taskResult.tasks) ? taskResult.tasks : [];
      const logs = await readRecentLogs({
        projectRoot: runtime.rootPath,
        limit: 50,
      });

      const statusCount = {
        enabled: tasks.filter((x) => x.status === "enabled").length,
        paused: tasks.filter((x) => x.status === "paused").length,
        disabled: tasks.filter((x) => x.status === "disabled").length,
      };

      return c.json({
        success: true,
        now: new Date().toISOString(),
        agent: {
          name: runtime.config.name,
          status: "running",
        },
        contexts: {
          total: contexts.length,
          items: contexts,
        },
        services,
        tasks: {
          total: tasks.length,
          statusCount,
        },
        logs,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/services", (c) => {
    return c.json({
      success: true,
      services: listServiceRuntimes(),
    });
  });

  app.get("/api/tui/contexts", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const limit = toLimit(c.req.query("limit"));
      const contexts = await listContextSummaries({
        projectRoot: runtime.rootPath,
        limit,
      });
      return c.json({
        success: true,
        contexts,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/contexts/:contextId/messages", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const limit = toLimit(c.req.query("limit"), 200);
      const contextId = decodeMaybe(String(c.req.param("contextId") || "").trim());
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }

      const filePath = getShipContextMessagesPath(runtime.rootPath, contextId);
      const messages = await loadContextMessagesFromFile(filePath);
      const sliced = messages.slice(-limit).flatMap((message) => toUiMessageTimeline(message));
      return c.json({
        success: true,
        contextId,
        total: sliced.length,
        rawTotal: messages.length,
        messages: sliced,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/tui/contexts/:contextId/execute", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const contextId = decodeMaybe(String(c.req.param("contextId") || "").trim());
      const body = (await c.req.json().catch(() => ({}))) as {
        instructions?: string;
      };
      const instructions = String(body.instructions || "").trim();
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }
      if (!instructions) {
        return c.json({ success: false, error: "Missing instructions" }, 400);
      }

      const result = await executeByContextId({
        runtime,
        contextId,
        instructions,
      });
      return c.json({
        success: true,
        contextId,
        result,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/tasks", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const status = toOptionalString(c.req.query("status"));
      const result = await listTaskDefinitions({
        projectRoot: runtime.rootPath,
        ...(status ? { status: status as "enabled" | "paused" | "disabled" } : {}),
      });
      return c.json({
        success: true,
        tasks: Array.isArray(result.tasks) ? result.tasks : [],
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/tui/tasks/run", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        taskId?: string;
        reason?: string;
      };
      const taskId = String(body.taskId || "").trim();
      if (!taskId || !isValidTaskId(taskId)) {
        return c.json({ success: false, error: "Invalid taskId" }, 400);
      }

      const reason = toOptionalString(body.reason);
      const result = await runServiceCommand({
        serviceName: "task",
        command: "run",
        payload: {
          taskId,
          ...(reason ? { reason } : {}),
        },
        context: params.getServiceRuntimeState(),
      });
      return c.json(result, result.success ? 200 : 400);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/tasks/:taskId/runs", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const taskId = String(c.req.param("taskId") || "").trim();
      if (!taskId || !isValidTaskId(taskId)) {
        return c.json({ success: false, error: "Invalid taskId" }, 400);
      }

      const limit = toLimit(c.req.query("limit"), 50);
      const runs = await listTaskRuns({
        projectRoot: runtime.rootPath,
        taskId,
        limit,
      });
      return c.json({ success: true, taskId, runs });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/tasks/:taskId/runs/:timestamp", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const taskId = String(c.req.param("taskId") || "").trim();
      const timestamp = String(c.req.param("timestamp") || "").trim();
      if (!taskId || !isValidTaskId(taskId)) {
        return c.json({ success: false, error: "Invalid taskId" }, 400);
      }
      if (!TASK_RUN_DIR_REGEX.test(timestamp)) {
        return c.json({ success: false, error: "Invalid timestamp" }, 400);
      }

      const detail = await readTaskRunDetail({
        projectRoot: runtime.rootPath,
        taskId,
        timestamp,
      });
      if (!detail) {
        return c.json({ success: false, error: "Run not found" }, 404);
      }
      return c.json({ success: true, ...detail });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/tui/logs", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const limit = toLimit(c.req.query("limit"), 200);
      const logs = await readRecentLogs({
        projectRoot: runtime.rootPath,
        limit,
      });
      return c.json({
        success: true,
        logs,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
