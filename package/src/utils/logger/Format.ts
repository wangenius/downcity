import type { JsonObject, JsonValue } from "@/types/Json.js";

type ParsedPayload = JsonObject | JsonValue[];
type FormattedToolCall = {
  id?: string;
  type?: string;
  name?: string;
  arguments?: string;
};

/**
 * 按会话记录“上次已打印的消息数”。
 *
 * 关键点（中文）
 * - 用于 LLM 请求日志的增量打印，避免每轮都重复输出全量历史 messages。
 * - key 建议使用 contextId；无 key 时保持原有行为（全量打印）。
 */
const lastLoggedMessagesCountByKey = new Map<string, number>();

function isJsonObject(value: JsonValue | null | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(
  objectValue: JsonObject,
  field: string,
): string | undefined {
  const value = objectValue[field];
  return typeof value === "string" ? value : undefined;
}

function getObjectField(
  objectValue: JsonObject,
  field: string,
): JsonObject | undefined {
  const value = objectValue[field];
  return isJsonObject(value) ? value : undefined;
}

function getArrayField(objectValue: JsonObject, field: string): JsonValue[] | undefined {
  const value = objectValue[field];
  return Array.isArray(value) ? value : undefined;
}

function safeJsonParse(input: string | undefined): ParsedPayload | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed) as JsonValue;
    return isJsonObject(parsed) || Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `…(truncated, ${text.length} chars total)`;
}

function stringifyCompact(
  value: JsonValue | object | undefined,
  maxChars: number,
): string {
  try {
    return truncate(JSON.stringify(value), maxChars);
  } catch {
    return truncate(String(value), maxChars);
  }
}

function toInlineLogValue(value: string, maxChars: number): string {
  return truncate(String(value || ""), maxChars).replace(/\r?\n/g, "\\n");
}

function formatLogField(key: string, value: string): string {
  return `[${key}]: ${value}`;
}

function contentToText(content: JsonValue | undefined, maxChars: number): string {
  if (typeof content === "string") return truncate(content, maxChars);
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (!isJsonObject(part)) return "";
        const partType = getStringField(part, "type");
        if (partType === "text" || partType === "input_text") {
          return String(getStringField(part, "text") ?? "");
        }
        if (partType === "tool-approval-request") {
          const toolCall = getObjectField(part, "toolCall");
          const toolName = toolCall ? getStringField(toolCall, "toolName") : "";
          return `Approval requested: ${String(toolName ?? "")}`;
        }
        if (partType === "tool-call") {
          const toolName = String(getStringField(part, "toolName") ?? "");
          if (!toolName) return "Tool call:";

          // 关键点（中文）：在 function call 日志中补充 exec_command 的 cmd，便于直接定位执行命令。
          if (toolName === "exec_command") {
            const execCmd = extractExecCommandCmd(part);
            return execCmd
              ? `Tool call: ${toolName} cmd=${truncate(execCmd, Math.max(64, Math.floor(maxChars / 2)))}`
              : `Tool call: ${toolName}`;
          }

          return `Tool call: ${toolName}`;
        }
        if (partType === "tool-result") {
          return `Tool result: ${String(getStringField(part, "toolName") ?? "")}`;
        }
        if (partType === "tool-error") {
          return `Tool error: ${String(getStringField(part, "toolName") ?? "")}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
    return truncate(parts, maxChars);
  }
  if (isJsonObject(content)) return stringifyCompact(content, maxChars);
  return truncate(String(content ?? ""), maxChars);
}

function parsePossibleJsonObject(value: JsonValue | undefined): JsonObject | undefined {
  if (isJsonObject(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = safeJsonParse(value);
  return isJsonObject(parsed) ? parsed : undefined;
}

function extractExecCommandCmd(part: JsonObject): string | undefined {
  const inputValue = part.input ?? part.rawInput ?? part.arguments;
  const inputObj = parsePossibleJsonObject(inputValue);
  if (!inputObj) return undefined;
  return getStringField(inputObj, "cmd");
}

function extractFunctionCallExecCommandCmd(message: JsonObject): string | undefined {
  const itemType = getStringField(message, "type");
  if (itemType !== "function_call") return undefined;

  const name = getStringField(message, "name");
  if (name !== "exec_command") return undefined;

  const argsObj = parsePossibleJsonObject(message.arguments);
  if (!argsObj) return undefined;
  return getStringField(argsObj, "cmd");
}

function extractMessages(payload: JsonObject): JsonObject[] | null {
  const messages = getArrayField(payload, "messages");
  if (Array.isArray(messages)) {
    return messages.filter((item): item is JsonObject => isJsonObject(item));
  }
  const input = getArrayField(payload, "input");
  if (Array.isArray(input)) {
    return input.filter((item): item is JsonObject => isJsonObject(item));
  }
  return null;
}

function extractSystemForLog(payload: JsonObject | undefined): JsonValue | undefined {
  if (!payload) return undefined;

  const system = payload.system;
  if (typeof system === "string" && system.trim()) return system;

  // 关键点（中文）：OpenAI Responses 请求把 system prompt 放在 `instructions` 字段。
  const instructions = getStringField(payload, "instructions");
  if (typeof instructions === "string" && instructions.trim()) {
    return instructions;
  }

  return system;
}

function formatToolCalls(
  toolCalls: JsonValue | undefined,
  maxArgsChars: number,
): FormattedToolCall[] | null {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  const out: FormattedToolCall[] = [];

  for (const toolCall of toolCalls) {
    if (!isJsonObject(toolCall)) continue;

    const id = getStringField(toolCall, "id");
    const type = getStringField(toolCall, "type");
    const fn = getObjectField(toolCall, "function");
    const name =
      (fn && getStringField(fn, "name")) || getStringField(toolCall, "tool");
    const argsRaw = fn ? fn.arguments : toolCall.arguments;
    const args =
      typeof argsRaw === "string"
        ? truncate(argsRaw, maxArgsChars)
        : truncate(JSON.stringify(argsRaw ?? {}), maxArgsChars);

    out.push({
      ...(id ? { id } : {}),
      ...(type ? { type } : {}),
      ...(name ? { name } : {}),
      ...(args ? { arguments: args } : {}),
    });
  }

  return out.length > 0 ? out : null;
}

function resolveMessageRoleLabel(message: JsonObject): string {
  const role = getStringField(message, "role");
  if (role) return role;
  const itemType = getStringField(message, "type");
  if (itemType) return `item:${itemType}`;
  return "item";
}

function summarizeValue(value: JsonValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (isJsonObject(value)) return `[object:${Object.keys(value).length}]`;
  return String(value);
}

function formatMessagesForLog(
  messages: JsonObject[],
  opts: {
    maxContentChars: number;
    maxToolArgsChars: number;
  },
): string[] {
  const out: string[] = [];

  for (const message of messages) {
    const role = resolveMessageRoleLabel(message);
    const name = getStringField(message, "name");
    const toolCallId = getStringField(message, "tool_call_id");
    const callId = getStringField(message, "call_id");
    const output = summarizeValue(message.output);
    const outputText = summarizeValue(message.output_text);
    const segments: string[] = [];

    if (name) segments.push(`name=${name}`);
    if (toolCallId) segments.push(`tool_call_id=${toolCallId}`);
    if (callId) segments.push(`call_id=${callId}`);
    const functionCallExecCmd = extractFunctionCallExecCommandCmd(message);
    // 关键点（中文）：Responses API 的 item:function_call 里把 exec_command 的 cmd 打出来，便于直接排障。
    if (functionCallExecCmd) {
      segments.push(`cmd=${truncate(functionCallExecCmd, opts.maxToolArgsChars)}`);
    }

    const toolCalls = formatToolCalls(message.tool_calls, opts.maxToolArgsChars);
    if (toolCalls) {
      for (const toolCall of toolCalls) {
        const label = [
          toolCall.id ? `id=${toolCall.id}` : "",
          toolCall.type ? `type=${toolCall.type}` : "",
          toolCall.name ? `name=${toolCall.name}` : "",
          toolCall.arguments ? `args=${toolCall.arguments}` : "",
        ]
          .filter(Boolean)
          .join("; ");
        if (label) segments.push(`tool{${label}}`);
      }
    }

    if ("content" in message) {
      const contentText = contentToText(message.content, opts.maxContentChars);
      if (contentText) segments.push(contentText);
    }
    if (outputText) segments.push(`output_text=${outputText}`);
    if (output) segments.push(`output=${output}`);

    const summary = toInlineLogValue(
      segments.filter(Boolean).join(" | ") || "-",
      opts.maxContentChars,
    );
    out.push(`[${role}]: ${summary}`);
  }

  return out;
}

function formatPayloadSummaryLines(
  payload: ParsedPayload,
  maxChars: number,
): string[] {
  if (Array.isArray(payload)) {
    return [formatLogField("payload", `[array:${payload.length}]`)];
  }
  const keys = Object.keys(payload);
  const lines: string[] = [formatLogField("payload.keys", keys.join(",") || "-")];
  for (const key of keys.slice(0, 12)) {
    const summary = summarizeValue(payload[key]);
    if (!summary) continue;
    lines.push(
      formatLogField(`payload.${key}`, toInlineLogValue(summary, maxChars)),
    );
  }
  return lines;
}

export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function parseFetchRequestForLog(
  input: string | URL | Request,
  init?: RequestInit,
  opts?: {
    incrementalKey?: string;
  },
): {
  url: string;
  method: string;
  payload: ParsedPayload | null;
  includePayload: boolean;
  maxChars: number;
  messages: JsonObject[] | null;
  system: JsonValue | undefined;
  model?: string;
  toolsCount: number;
  systemLength?: number;
  requestText: string;
  meta: JsonObject;
} | null {
  // 关键注释：这里的 maxChars 不用于“整体截断请求日志”，仅作为 payload 兜底 stringify 的保护上限。
  const maxChars = 12000;
  // 统一开关：只由 ship.json 的 llm.logMessages 控制（见 main/llm/CreateModel.ts）。
  // 这里不支持额外的“更敏感 payload”开关，避免不一致与误配置。
  const includePayload = false;

  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = String(
    init?.method ||
      (input instanceof Request ? input.method : "POST"),
  );

  const initBody = typeof init?.body === "string" ? init.body : undefined;
  const payload = safeJsonParse(initBody);
  if (!payload) {
    if (initBody) {
      return {
        url,
        method,
        payload: null,
        includePayload,
        maxChars,
        messages: null,
        system: undefined,
        toolsCount: 0,
        requestText: [
          "===== LLM REQUEST BEGIN =====",
          formatLogField("method", method),
          formatLogField("url", url),
          formatLogField("body", "non-json"),
          "===== LLM REQUEST END =====",
        ].join("\n"),
        meta: { kind: "llm_request", url, method },
      };
    }
    return null;
  }

  const payloadObject = isJsonObject(payload) ? payload : undefined;
  const model = payloadObject ? getStringField(payloadObject, "model") : undefined;
  const system = extractSystemForLog(payloadObject);
  const messages = payloadObject ? extractMessages(payloadObject) : null;
  const tools = payloadObject ? payloadObject.tools : undefined;
  const toolsCount = Array.isArray(tools)
    ? tools.length
    : isJsonObject(tools)
      ? Object.keys(tools).length
      : 0;

  const headerLines: string[] = [
    "===== LLM REQUEST BEGIN =====",
    formatLogField("method", method),
    formatLogField("url", url),
    ...(model ? [formatLogField("model", model)] : []),
    ...(toolsCount ? [formatLogField("tools", String(toolsCount))] : []),
  ];

  const messageTextParts: string[] = [...headerLines];
  if (typeof system === "string" && system.trim()) {
    messageTextParts.push(
      formatLogField("system", toInlineLogValue(system, 4000)),
    );
  }

  if (messages && Array.isArray(messages)) {
    const incrementalKey = String(opts?.incrementalKey || "").trim();
    const selectedMessages = selectMessagesForIncrementalLog(
      messages,
      incrementalKey,
    );
    messageTextParts.push(...formatMessagesForLog(selectedMessages, {
      maxContentChars: 2000,
      maxToolArgsChars: 1200,
    }));
    if (selectedMessages.length === 0) {
      messageTextParts.push(formatLogField("messages", "no incremental items"));
    }
  } else {
    messageTextParts.push(...formatPayloadSummaryLines(payload, maxChars));
  }
  messageTextParts.push("===== LLM REQUEST END =====");

  return {
    url,
    method,
    payload,
    includePayload,
    maxChars,
    messages,
    system,
    model,
    toolsCount,
    systemLength: typeof system === "string" ? system.length : undefined,
    // 注意：不做整体截断；每条消息已单独截断。
    requestText: messageTextParts.join("\n"),
    meta: {
      kind: "llm_request",
      url,
      method,
      ...(model ? { model } : {}),
      toolsCount,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      ...(typeof system === "string" ? { systemLength: system.length } : {}),
      ...(includePayload ? { payload } : {}),
    },
  };
}

function selectMessagesForIncrementalLog(
  messages: JsonObject[],
  incrementalKey: string,
): JsonObject[] {
  if (!incrementalKey) return messages;

  const prevCount = lastLoggedMessagesCountByKey.get(incrementalKey) ?? 0;
  const currentCount = messages.length;
  lastLoggedMessagesCountByKey.set(incrementalKey, currentCount);

  if (currentCount > prevCount) {
    return messages.slice(prevCount);
  }

  // 关键点（中文）：当消息数回退（compact/rewrite）时，打印最近两条作为对齐点。
  if (currentCount < prevCount) {
    return messages.slice(Math.max(0, currentCount - 2));
  }

  return [];
}
