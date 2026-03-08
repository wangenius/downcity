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
  return `[${key}] ${value}`;
}

function pushLabeledTextLines(
  out: string[],
  label: "user" | "assistant" | "tool" | "tool_result",
  text: string,
  maxChars: number,
): void {
  const normalized = truncate(String(text || "-"), maxChars).replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  for (const line of lines) {
    out.push(formatLogField(label, line || "-"));
  }
}

function parseInfoBlockText(value: string): {
  body: string;
} | null {
  const normalized = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!normalized.startsWith("<info>\n")) return null;
  const matched = normalized.match(/^<info>\n([\s\S]*?)\n<\/info>(?:\n\n([\s\S]*))?$/);
  if (!matched) return null;

  return {
    body: String(matched[2] || "").trim(),
  };
}

function contentToText(content: JsonValue | undefined, maxChars: number): string {
  if (typeof content === "string") return truncate(content, maxChars);
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (!isJsonObject(part)) return "";
        const partType = getStringField(part, "type");
        // 关键点（中文）：OpenAI Responses 在 assistant 历史里常见 `output_text`，必须纳入日志提取，否则会显示为 `-`。
        if (
          partType === "text" ||
          partType === "input_text" ||
          partType === "output_text"
        ) {
          return String(getStringField(part, "text") ?? "");
        }
        // 关键点（中文）：tool 事件由 formatMessagesForLog 单独输出为 [tool]/[tool_result]，这里不混入文本。
        if (
          partType === "tool-approval-request" ||
          partType === "tool-call" ||
          partType === "tool-result" ||
          partType === "tool-error"
        ) {
          return "";
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
    const role = String(getStringField(message, "role") || "").trim().toLowerCase();
    const itemType = String(getStringField(message, "type") || "")
      .trim()
      .toLowerCase();
    const output = summarizeValue(message.output);
    const outputText = summarizeValue(message.output_text);

    const toolCalls = formatToolCalls(message.tool_calls, opts.maxToolArgsChars);
    if (toolCalls) {
      for (const toolCall of toolCalls) {
        const detail = [
          toolCall.name ? String(toolCall.name) : "",
          toolCall.arguments ? `args=${toolCall.arguments}` : "",
        ]
        .filter(Boolean)
          .join(" | ");
        if (detail) {
          pushLabeledTextLines(out, "tool", detail, opts.maxToolArgsChars);
        }
      }
    }

    if (itemType === "function_call") {
      const functionName = String(getStringField(message, "name") || "").trim();
      const functionCallExecCmd = extractFunctionCallExecCommandCmd(message);
      const argsText =
        typeof message.arguments === "string"
          ? truncate(message.arguments, opts.maxToolArgsChars)
          : "";
      const functionCallDetail = [
        functionName || "function_call",
        functionCallExecCmd ? `cmd=${functionCallExecCmd}` : "",
        !functionCallExecCmd && argsText ? `args=${argsText}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      pushLabeledTextLines(
        out,
        "tool",
        functionCallDetail || "function_call",
        opts.maxToolArgsChars,
      );
      continue;
    }

    let bodyText = "";
    if ("content" in message) {
      const contentText = contentToText(message.content, opts.maxContentChars);
      if (role === "user") {
        const parsedInfoBlock = parseInfoBlockText(contentText);
        bodyText = parsedInfoBlock ? parsedInfoBlock.body : contentText;
      } else {
        bodyText = contentText;
      }
    }

    if (role === "user") {
      pushLabeledTextLines(out, "user", bodyText || "-", opts.maxContentChars);
      continue;
    }

    if (
      role === "tool" ||
      itemType === "function_call_output" ||
      itemType === "tool-result" ||
      itemType === "tool_error" ||
      itemType === "tool-error"
    ) {
      const toolResultText = [bodyText, outputText, output].filter(Boolean).join(" | ");
      pushLabeledTextLines(
        out,
        "tool_result",
        toolResultText || "-",
        opts.maxContentChars,
      );
      continue;
    }

    const assistantText = [bodyText, outputText, output]
      .filter(Boolean)
      .join(bodyText ? "" : " | ");
    if (assistantText) {
      pushLabeledTextLines(out, "assistant", assistantText, opts.maxContentChars);
    }
  }

  return out;
}

function formatPayloadSummaryLines(
  payload: ParsedPayload,
  maxChars: number,
): string[] {
  if (Array.isArray(payload)) {
    return [formatLogField("agent", `payload=[array:${payload.length}]`)];
  }
  const keys = Object.keys(payload).slice(0, 12).join(",") || "-";
  return [formatLogField("agent", toInlineLogValue(`payload.keys=${keys}`, maxChars))];
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
        requestText: formatLogField("agent", "llm.request non-json body"),
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
  const toolChoiceRaw = payloadObject
    ? payloadObject.tool_choice ?? payloadObject.toolChoice
    : undefined;
  const toolChoice =
    typeof toolChoiceRaw === "string"
      ? toolChoiceRaw
      : toolChoiceRaw !== undefined
        ? stringifyCompact(toolChoiceRaw as JsonValue | object, 300)
        : undefined;
  const toolsCount = Array.isArray(tools)
    ? tools.length
    : isJsonObject(tools)
      ? Object.keys(tools).length
      : 0;

  const messageTextParts: string[] = [];

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
      messageTextParts.push(formatLogField("agent", "no incremental items"));
    }
  } else {
    messageTextParts.push(...formatPayloadSummaryLines(payload, maxChars));
  }
  if (messageTextParts.length === 0) {
    messageTextParts.push(formatLogField("agent", "empty"));
  }

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
      ...(toolChoice ? { toolChoice } : {}),
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
    return trimLeadingAssistantMessages(messages.slice(prevCount));
  }

  // 关键点（中文）：当消息数回退（compact/rewrite）时，打印最近两条作为对齐点。
  if (currentCount < prevCount) {
    return trimLeadingAssistantMessages(
      messages.slice(Math.max(0, currentCount - 2)),
    );
  }

  return [];
}

function trimLeadingAssistantMessages(messages: JsonObject[]): JsonObject[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const firstUserIndex = messages.findIndex(
    (message) => getStringField(message, "role") === "user",
  );
  if (firstUserIndex <= 0) return messages;
  for (let index = 0; index < firstUserIndex; index += 1) {
    if (getStringField(messages[index], "role") !== "assistant") {
      return messages;
    }
  }
  // 关键点（中文）：增量片段若以“上一轮 assistant 历史”开头且随后有新 user，默认省略前置 assistant，避免视觉延迟错觉。
  return messages.slice(firstUserIndex);
}
