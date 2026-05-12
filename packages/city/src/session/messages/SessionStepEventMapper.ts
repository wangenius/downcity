/**
 * SessionStepEventMapper：把单个 step 结果转成按顺序可持久化的 session 消息。
 *
 * 关键点（中文）
 * - 顺序固定为 `assistant text -> tool-call -> tool-result`。
 * - 只做 best-effort 提取，不依赖 provider 私有结构。
 * - 输出仍然是标准 SessionMessageV1，供 SessionHistoryWriter 直接落盘。
 */

import { generateId } from "@shared/utils/Id.js";
import type { JsonObject } from "@/shared/types/Json.js";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function resolveToolName(value: unknown): string {
  const record = toRecord(value);
  if (!record) return "";
  const toolName =
    typeof record.toolName === "string"
      ? record.toolName
      : typeof record.tool === "string"
        ? record.tool
        : typeof record.name === "string"
          ? record.name
          : "";
  return String(toolName || "").trim();
}

function resolveToolCallId(value: unknown): string {
  const record = toRecord(value);
  if (!record) return "";
  const toolCallId =
    typeof record.toolCallId === "string"
      ? record.toolCallId
      : typeof record.id === "string"
        ? record.id
        : "";
  return String(toolCallId || "").trim();
}

function resolveToolCallInput(value: unknown): unknown {
  const record = toRecord(value);
  if (!record) return undefined;
  if ("input" in record) return record.input;
  if ("rawInput" in record) return record.rawInput;
  if ("arguments" in record) return record.arguments;
  if ("args" in record) return record.args;
  return undefined;
}

function resolveToolResultPayload(value: unknown): unknown {
  const record = toRecord(value);
  if (!record) return undefined;
  if ("result" in record) return record.result;
  if ("output" in record) return record.output;
  if ("errorText" in record) return record.errorText;
  if ("error" in record) return record.error;
  return undefined;
}

function resolveAcpEventType(value: unknown): string {
  const record = toRecord(value);
  const type = typeof record?.type === "string" ? record.type : "";
  return type.trim();
}

function resolveAcpEventData(value: unknown): unknown {
  const record = toRecord(value);
  if (!record) return value;
  if ("data" in record) return record.data;
  return record;
}

function toDataPartType(type: string): string {
  return `data-acp-${type.replace(/_/g, "-")}`;
}

function buildMetadata(params: {
  sessionId: string;
  ts: number;
  extra?: JsonObject;
}): SessionMessageV1["metadata"] {
  return {
    v: 1,
    ts: params.ts,
    sessionId: params.sessionId,
    source: "egress",
    kind: "normal",
    ...(params.extra ? { extra: params.extra } : {}),
  };
}

function buildAssistantStepMessage(params: {
  sessionId: string;
  ts: number;
  part: Record<string, unknown>;
  extra: JsonObject;
}): SessionMessageV1 {
  return {
    id: `a:${params.sessionId}:${generateId()}`,
    role: "assistant",
    metadata: buildMetadata({
      sessionId: params.sessionId,
      ts: params.ts,
      extra: params.extra,
    }),
    parts: [params.part as SessionMessageV1["parts"][number]],
  };
}

/**
 * 从 stepResult 提取按顺序落盘的 session assistant 消息。
 */
export function buildSessionStepEventMessages(params: {
  sessionId: string;
  stepIndex: number;
  stepResult?: unknown;
  text: string;
  visibility?: "visible" | "internal";
}): SessionMessageV1[] {
  const sessionId = String(params.sessionId || "").trim();
  if (!sessionId) return [];

  const out: SessionMessageV1[] = [];
  const stepRecord = toRecord(params.stepResult) || {};
  const toolCalls = Array.isArray(stepRecord.toolCalls) ? stepRecord.toolCalls : [];
  const toolResults = Array.isArray(stepRecord.toolResults)
    ? stepRecord.toolResults
    : [];
  const acpEvents = Array.isArray(stepRecord.acpEvents)
    ? stepRecord.acpEvents
    : [];
  const baseTs = Date.now();
  let sequence = 0;

  const text = String(params.text || "").trim();
  if (text) {
    const isInternal = params.visibility === "internal";
    out.push(
      buildAssistantStepMessage({
        sessionId,
        ts: baseTs + sequence,
        part: isInternal
          ? {
              type: "reasoning",
              text,
              state: "done",
            }
          : {
              type: "text",
              text,
            },
        extra: {
          internal: isInternal ? "assistant_step_reasoning" : "assistant_step_text",
          stepIndex: params.stepIndex,
          persistedBy: "session_store_run",
        },
      }),
    );
    sequence += 1;
  }

  for (let index = 0; index < toolCalls.length; index += 1) {
    const toolCall = toolCalls[index];
    const toolName = resolveToolName(toolCall) || "unknown_tool";
    const toolCallId = resolveToolCallId(toolCall);
    const input = resolveToolCallInput(toolCall);
    out.push(
      buildAssistantStepMessage({
        sessionId,
        ts: baseTs + sequence,
        part: {
          type: "tool-call",
          toolName,
          ...(toolCallId ? { toolCallId } : {}),
          ...(input !== undefined ? { input } : {}),
        },
        extra: {
          internal: "assistant_step_tool_call",
          stepIndex: params.stepIndex,
          toolIndex: index + 1,
        },
      }),
    );
    sequence += 1;
  }

  for (let index = 0; index < toolResults.length; index += 1) {
    const toolResult = toolResults[index];
    const toolName = resolveToolName(toolResult) || "unknown_tool";
    const toolCallId = resolveToolCallId(toolResult);
    const result = resolveToolResultPayload(toolResult);
    out.push(
      buildAssistantStepMessage({
        sessionId,
        ts: baseTs + sequence,
        part: {
          type: "tool-result",
          toolName,
          ...(toolCallId ? { toolCallId } : {}),
          ...(result !== undefined ? { result } : {}),
        },
        extra: {
          internal: "assistant_step_tool_result",
          stepIndex: params.stepIndex,
          toolIndex: index + 1,
        },
      }),
    );
    sequence += 1;
  }

  for (let index = 0; index < acpEvents.length; index += 1) {
    const acpEvent = acpEvents[index];
    const type = resolveAcpEventType(acpEvent);
    if (!type) continue;
    out.push(
      buildAssistantStepMessage({
        sessionId,
        ts: baseTs + sequence,
        part: {
          type: toDataPartType(type),
          data: resolveAcpEventData(acpEvent),
        },
        extra: {
          internal: "assistant_step_acp_event",
          stepIndex: params.stepIndex,
          acpEventType: type,
          eventIndex: index + 1,
        },
      }),
    );
    sequence += 1;
  }

  return out;
}
