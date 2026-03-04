import type { JsonObject, JsonValue } from "@/types/Json.js";

type ParsedPayload = JsonObject | JsonValue[];
type FormattedToolCall = {
  id?: string;
  type?: string;
  name?: string;
  arguments?: string;
};

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
          return `Tool call: ${String(getStringField(part, "toolName") ?? "")}`;
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

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    const role = resolveMessageRoleLabel(message);
    const name = getStringField(message, "name");
    const toolCallId = getStringField(message, "tool_call_id");
    const callId = getStringField(message, "call_id");
    const output = summarizeValue(message.output);
    const outputText = summarizeValue(message.output_text);

    out.push(formatLogField(`msg.${index}.role`, role));
    if (name) out.push(formatLogField(`msg.${index}.name`, name));
    if (toolCallId) out.push(formatLogField(`msg.${index}.tool_call_id`, toolCallId));
    if (callId) out.push(formatLogField(`msg.${index}.call_id`, callId));

    const toolCalls = formatToolCalls(message.tool_calls, opts.maxToolArgsChars);
    if (toolCalls) {
      for (let toolIndex = 0; toolIndex < toolCalls.length; toolIndex++) {
        const toolCall = toolCalls[toolIndex];
        const label = [
          toolCall.id ? `id=${toolCall.id}` : "",
          toolCall.type ? `type=${toolCall.type}` : "",
          toolCall.name ? `name=${toolCall.name}` : "",
          toolCall.arguments ? `args=${toolCall.arguments}` : "",
        ]
          .filter(Boolean)
          .join("; ");
        if (label) {
          out.push(
            formatLogField(
              `msg.${index}.tool.${toolIndex}`,
              toInlineLogValue(label, opts.maxToolArgsChars),
            ),
          );
        }
      }
    }

    if ("content" in message) {
      const contentText = contentToText(message.content, opts.maxContentChars);
      if (contentText) {
        out.push(
          formatLogField(
            `msg.${index}.content`,
            toInlineLogValue(contentText, opts.maxContentChars),
          ),
        );
      }
    }
    if (outputText) {
      out.push(
        formatLogField(
          `msg.${index}.output_text`,
          toInlineLogValue(outputText, opts.maxContentChars),
        ),
      );
    }
    if (output) {
      out.push(
        formatLogField(
          `msg.${index}.output`,
          toInlineLogValue(output, opts.maxContentChars),
        ),
      );
    }
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
  // 统一开关：只由 ship.json 的 llm.logMessages 控制（见 core/llm/create-model.ts）。
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
  const system = payloadObject ? payloadObject.system : undefined;
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
    messageTextParts.push(...formatMessagesForLog(messages, {
      maxContentChars: 2000,
      maxToolArgsChars: 1200,
    }));
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
