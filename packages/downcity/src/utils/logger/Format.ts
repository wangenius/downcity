import type { JsonObject, JsonValue } from "@/types/Json.js";

type ParsedPayload = JsonObject | JsonValue[];
type FormattedToolCall = {
  id?: string;
  type?: string;
  name?: string;
  arguments?: string;
};
// 关键点（中文）：system/developer 指令需要完整可审计，日志不做截断。
const UNLIMITED_LOG_CHARS = Number.MAX_SAFE_INTEGER;

/**
 * 按会话记录“上次已打印的消息数”。
 *
 * 关键点（中文）
 * - 用于 LLM 请求日志的增量打印，避免每轮都重复输出全量历史 messages。
 * - key 建议使用 sessionId；无 key 时保持原有行为（全量打印）。
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

function normalizeAttrKey(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
}

function normalizeAttrValue(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[\]\[]/g, "");
}

function pushLabeledTextBlock(
  out: string[],
  label: "system" | "user" | "assistant" | "tool" | "tool_result",
  text: string,
  maxChars: number,
  attrs?: string[],
): void {
  // 关键点（中文）：日志按“每条消息一段”输出，段内换行转义为字面量 `\n`，保证紧凑且可分段。
  const normalized = truncate(String(text || "-"), maxChars)
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n");
  const headLabel =
    Array.isArray(attrs) && attrs.length > 0 ? `${label} ${attrs.join(" ")}` : label;
  out.push(formatLogField(headLabel, normalized || "-"));
}

function parseInfoBlockText(value: string): {
  info: Record<string, string>;
  body: string;
} | null {
  const normalized = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!normalized.startsWith("<info>\n")) return null;
  const matched = normalized.match(/^<info>\n([\s\S]*?)\n<\/info>(?:\n\n([\s\S]*))?$/);
  if (!matched) return null;

  const info: Record<string, string> = {};
  for (const rawLine of String(matched[1] || "").split("\n")) {
    const line = String(rawLine || "").trim();
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const key = normalizeAttrKey(line.slice(0, index));
    const fieldValue = normalizeAttrValue(line.slice(index + 1));
    if (!key || !fieldValue) continue;
    info[key] = fieldValue;
  }

  return {
    info,
    body: String(matched[2] || "").trim(),
  };
}

function buildInfoAttrs(info: Record<string, string>): string[] {
  const preferredOrder = [
    "message_id",
    "user_id",
    "username",
    "role_id",
    "permissions",
    "received_at",
    "user_timezone",
    "channel",
    "session_id",
    "context_id",
    "chat_key",
    "chat_id",
    "chat_type",
    "thread_id",
  ];

  const attrs: string[] = [];
  for (const key of preferredOrder) {
    const value = String(info[key] || "").trim();
    if (!value || value === "unknown" || value === "none") continue;
    attrs.push(`${key}=${value}`);
  }
  for (const [key, raw] of Object.entries(info)) {
    if (preferredOrder.includes(key)) continue;
    const value = String(raw || "").trim();
    if (!value) continue;
    attrs.push(`${key}=${value}`);
  }
  return attrs;
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
  if (name !== "shell_start" && name !== "shell_exec") return undefined;

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

/**
 * 规范化 system 提示词文本用于日志展示。
 *
 * 关键点（中文）
 * - `system` 可能是 string / object / array（不同 provider 形态不一致）。
 * - 统一折叠为可读文本，便于和历史 message 分段展示。
 */
function normalizeSystemTextForLog(
  system: JsonValue | undefined,
  maxChars: number,
): string {
  if (system === null || system === undefined) return "";
  if (typeof system === "string") return truncate(system, maxChars);

  if (Array.isArray(system)) {
    const merged = system
      .map((item) => summarizeValue(item))
      .filter(Boolean)
      .join("\n");
    return truncate(merged, maxChars);
  }

  if (isJsonObject(system)) {
    const directText =
      getStringField(system, "text") ||
      getStringField(system, "content") ||
      getStringField(system, "instructions");
    if (directText) return truncate(directText, maxChars);
    return stringifyCompact(system, maxChars);
  }

  return truncate(String(system), maxChars);
}

function formatMessagesForLog(
  messages: JsonObject[],
  opts: {
    maxContentChars: number;
    maxToolArgsChars: number;
    maxSystemChars: number;
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
          pushLabeledTextBlock(out, "tool", detail, opts.maxToolArgsChars);
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
      pushLabeledTextBlock(
        out,
        "tool",
        functionCallDetail || "function_call",
        opts.maxToolArgsChars,
      );
      continue;
    }

    let bodyText = "";
    let userInfoAttrs: string[] = [];
    if ("content" in message) {
      const isSystemRole = role === "system" || role === "developer";
      const contentText = contentToText(
        message.content,
        isSystemRole ? opts.maxSystemChars : opts.maxContentChars,
      );
      if (role === "user") {
        const parsedInfoBlock = parseInfoBlockText(contentText);
        bodyText = parsedInfoBlock ? parsedInfoBlock.body : contentText;
        userInfoAttrs = parsedInfoBlock ? buildInfoAttrs(parsedInfoBlock.info) : [];
      } else {
        bodyText = contentText;
      }
    }

    if (role === "user") {
      pushLabeledTextBlock(
        out,
        "user",
        bodyText || "-",
        opts.maxContentChars,
        userInfoAttrs,
      );
      continue;
    }

    if (role === "system" || role === "developer") {
      pushLabeledTextBlock(out, "system", bodyText || "-", opts.maxSystemChars);
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
      pushLabeledTextBlock(
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
      pushLabeledTextBlock(out, "assistant", assistantText, opts.maxContentChars);
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

type ProviderResponseLike = {
  status: number;
  ok: boolean;
  headers: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
};

function pickOutputTypes(output: JsonValue[] | undefined): string[] {
  if (!Array.isArray(output)) return [];
  return output
    .map((item) => {
      if (!isJsonObject(item)) return "";
      return getStringField(item, "type") || "";
    })
    .filter((type) => Boolean(type))
    .slice(0, 16);
}

function pickFunctionCallNames(output: JsonValue[] | undefined): string[] {
  if (!Array.isArray(output)) return [];
  return output
    .map((item) => {
      if (!isJsonObject(item)) return "";
      if (getStringField(item, "type") !== "function_call") return "";
      return getStringField(item, "name") || "";
    })
    .filter((name) => Boolean(name))
    .slice(0, 8);
}

function summarizeResponseObjectForLog(
  responseObject: JsonObject | undefined,
): JsonObject {
  if (!responseObject) return {};

  const output = getArrayField(responseObject, "output");
  const incompleteDetails =
    getObjectField(responseObject, "incomplete_details") ||
    getObjectField(responseObject, "incompleteDetails");
  const finishReason =
    getStringField(responseObject, "finish_reason") ||
    getStringField(responseObject, "finishReason");

  return {
    responseId: getStringField(responseObject, "id") || null,
    responseObjectType: getStringField(responseObject, "object") || null,
    responseFinishReason: finishReason || null,
    responseIncompleteReason:
      getStringField(incompleteDetails || {}, "reason") || null,
    responseOutputCount: Array.isArray(output) ? output.length : 0,
    responseOutputTypes: pickOutputTypes(output),
    responseFunctionCallNames: pickFunctionCallNames(output),
  };
}

function summarizeSseBodyForLog(bodyText: string): JsonObject {
  const eventTypes: string[] = [];
  const streamedOutputTypes: string[] = [];
  const functionCallNames: string[] = [];
  let lastResponseObject: JsonObject | undefined;

  let currentEvent = "";
  let currentDataLines: string[] = [];

  const flushEvent = (): void => {
    const rawData = currentDataLines.join("\n").trim();
    currentDataLines = [];
    if (!rawData) {
      currentEvent = "";
      return;
    }
    if (rawData === "[DONE]") {
      eventTypes.push(currentEvent || "done");
      currentEvent = "";
      return;
    }

    const parsed = safeJsonParse(rawData);
    if (parsed && isJsonObject(parsed)) {
      const explicitType = getStringField(parsed, "type");
      const eventLabel = currentEvent || explicitType || "message";
      eventTypes.push(eventLabel);

      const nestedResponse = getObjectField(parsed, "response");
      if (nestedResponse) {
        lastResponseObject = nestedResponse;
      }

      const nestedItem = getObjectField(parsed, "item");
      const itemType = getStringField(nestedItem || {}, "type");
      if (itemType && !streamedOutputTypes.includes(itemType)) {
        streamedOutputTypes.push(itemType);
      }
      const functionName = getStringField(nestedItem || {}, "name");
      if (
        itemType === "function_call" &&
        functionName &&
        !functionCallNames.includes(functionName)
      ) {
        functionCallNames.push(functionName);
      }

      const directOutput = getArrayField(parsed, "output");
      for (const outputType of pickOutputTypes(directOutput)) {
        if (!streamedOutputTypes.includes(outputType)) {
          streamedOutputTypes.push(outputType);
        }
      }
      for (const functionCallName of pickFunctionCallNames(directOutput)) {
        if (!functionCallNames.includes(functionCallName)) {
          functionCallNames.push(functionCallName);
        }
      }
    } else {
      eventTypes.push(currentEvent || "message");
    }
    currentEvent = "";
  };

  for (const rawLine of String(bodyText || "").split(/\r?\n/)) {
    const line = String(rawLine || "");
    if (!line.trim()) {
      flushEvent();
      continue;
    }
    if (line.startsWith("event:")) {
      currentEvent = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      currentDataLines.push(line.slice("data:".length).trim());
    }
  }
  flushEvent();

  const responseSummary = summarizeResponseObjectForLog(lastResponseObject);
  return {
    responseEventTypes: eventTypes.slice(0, 20),
    streamedOutputTypes: streamedOutputTypes.slice(0, 16),
    streamedFunctionCallNames: functionCallNames.slice(0, 8),
    ...responseSummary,
  };
}

export async function parseFetchResponseForLog(
  response: ProviderResponseLike,
  opts?: {
    url?: string;
    method?: string;
  },
): Promise<{
  responseText: string;
  meta: JsonObject;
}> {
  const maxBodyPreviewChars = 2000;
  const contentType = String(response.headers.get("content-type") || "").trim();
  let bodyText = "";

  try {
    bodyText = await response.text();
  } catch (error) {
    const errorText = String(error || "unknown_error");
    return {
      responseText: formatLogField(
        "agent",
        toInlineLogValue(
          `llm.response status=${response.status} ok=${response.ok} contentType=${contentType || "-"} body_read_error=${errorText}`,
          maxBodyPreviewChars,
        ),
      ),
      meta: {
        kind: "llm_response",
        status: response.status,
        ok: response.ok,
        ...(contentType ? { contentType } : {}),
        ...(opts?.url ? { url: opts.url } : {}),
        ...(opts?.method ? { method: opts.method } : {}),
        bodyReadError: errorText,
      },
    };
  }

  let responseSummary: JsonObject = {};
  if (contentType.includes("application/json")) {
    const parsed = safeJsonParse(bodyText);
    if (parsed && isJsonObject(parsed)) {
      const nestedResponse = getObjectField(parsed, "response");
      responseSummary = summarizeResponseObjectForLog(
        nestedResponse || parsed,
      );
    }
  } else if (contentType.includes("text/event-stream")) {
    responseSummary = summarizeSseBodyForLog(bodyText);
  }

  const preview = toInlineLogValue(bodyText, maxBodyPreviewChars);
  const responseTextParts = [
    formatLogField(
      "agent",
      toInlineLogValue(
        `llm.response status=${response.status} ok=${response.ok} contentType=${contentType || "-"}`,
        maxBodyPreviewChars,
      ),
    ),
  ];
  if (preview) {
    responseTextParts.push(formatLogField("response_body", preview));
  }

  return {
    responseText: responseTextParts.join("\n\n"),
    meta: {
      kind: "llm_response",
      status: response.status,
      ok: response.ok,
      ...(contentType ? { contentType } : {}),
      ...(opts?.url ? { url: opts.url } : {}),
      ...(opts?.method ? { method: opts.method } : {}),
      responseBodyLength: bodyText.length,
      ...responseSummary,
    },
  };
}

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
  // 统一开关：只由 downcity.json 的 llm.logMessages 控制（见 console/model/CreateModel.ts）。
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
  const maxSystemChars = UNLIMITED_LOG_CHARS;

  if (messages && Array.isArray(messages)) {
    const hasSystemMessage = messages.some((item) => {
      const role = String(getStringField(item, "role") || "")
        .trim()
        .toLowerCase();
      return role === "system" || role === "developer";
    });
    if (!hasSystemMessage) {
      const systemText = normalizeSystemTextForLog(system, maxSystemChars).trim();
      if (systemText) {
        pushLabeledTextBlock(messageTextParts, "system", systemText, maxSystemChars);
      }
    }

    const incrementalKey = String(opts?.incrementalKey || "").trim();
    const selectedMessages = selectMessagesForIncrementalLog(
      messages,
      incrementalKey,
    );
    messageTextParts.push(...formatMessagesForLog(selectedMessages, {
      maxContentChars: 2000,
      maxToolArgsChars: 1200,
      maxSystemChars,
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
    requestText: messageTextParts.join("\n\n"),
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
