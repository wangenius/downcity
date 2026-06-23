 /**
  * AI Provider 通用工具模块。
  *
  * 集中管理 Provider 子类常用的输入解析、消息构造、usage 归一化、
  * HTTP 响应读取等工具函数。
  */

 import type { DynamicToolUIPart, FileUIPart, ToolSet, UIMessage } from "ai";
 import { jsonSchema, tool } from "ai";
 import type { AIProviderChargeLine } from "./charge.js";
 import type { Context } from "../service.js";

 // ===========================================================================
 // 基础类型判断
 // ===========================================================================

 /**
  * 判断一个值是否为普通对象。
  */
 export function isRecord(value: unknown): value is Record<string, unknown> {
   return Boolean(value && typeof value === "object" && !Array.isArray(value));
 }

 /**
  * 将未知值转换为普通对象，失败返回 null。
  */
 export function toRecord(value: unknown): Record<string, unknown> | null {
   return isRecord(value) ? value : null;
 }

 /**
  * 读取字符串字段，非字符串返回空字符串。
  */
 export function readString(value: unknown): string {
   return typeof value === "string" ? value.trim() : "";
 }

 /**
  * 过滤掉对象中的 undefined 值。
  */
 export function stripUndefined<T extends Record<string, unknown>>(record: T): T {
   return Object.fromEntries(
     Object.entries(record).filter(([, item]) => item !== undefined),
   ) as T;
 }

 // ===========================================================================
 // 环境变量与 URL
 // ===========================================================================

 /**
  * 移除 URL 尾部斜杠。
  */
 export function trimTrailingSlash(value: string): string {
   return value.replace(/\/+$/, "");
 }

 /**
  * 读取必填环境变量。
  */
 export function readRequiredEnv(ctx: Context, key: string): string {
   const value = ctx.env(key);
   if (!value) throw new Error(`${key} is required`);
   return value;
 }

 /**
  * 解析上游模型 ID。
  *
  * 优先使用 model meta 中的 upstream_model，其次使用 fallback。
  */
 export function resolveUpstreamModel(ctx: Context, fallback: string): string {
   const meta_model = typeof ctx.variant?.meta?.upstream_model === "string"
     ? ctx.variant.meta.upstream_model.trim()
     : "";
   return meta_model || fallback;
 }

 // ===========================================================================
 // HTTP 响应读取
 // ===========================================================================

 /**
  * 读取 JSON 响应，非 2xx 时抛出错误。
  */
 export async function readJsonResponse(response: Response): Promise<unknown> {
   const text = await response.text();
   const data = text ? JSON.parse(text) as unknown : {};
   if (!response.ok) {
     const message = readErrorMessage(data) || response.statusText || `HTTP ${response.status}`;
     throw new Error(message);
   }
   return data;
 }

 /**
  * 从上游错误响应中提取可读错误信息。
  */
 export function readErrorMessage(data: unknown): string {
   const record = toRecord(data);
   const nested = toRecord(record?.data) ?? toRecord(record?.job) ?? toRecord(record?.result);
   const error = toRecord(record?.error);
   const nested_error = toRecord(nested?.error);
   const detail = toRecord(error?.detail);
   const nested_detail = toRecord(nested_error?.detail);
   const message =
     readString(error?.message) ||
     readString(detail?.message) ||
     readString(nested_error?.message) ||
     readString(nested_detail?.message) ||
     readString(record?.message) ||
     readString(nested?.message) ||
     readString(record?.error) ||
     readString(nested?.error);
   const code =
     readString(error?.code) ||
     readString(detail?.code) ||
     readString(nested_error?.code) ||
     readString(nested_detail?.code);
   if (!message) return "";
   return code && !message.includes(code) ? `${message} (${code})` : message;
 }

 // ===========================================================================
 // 消息构造
 // ===========================================================================

 /**
  * generateText / streamText tool call 的临时形状。
  */
 export interface ToolCallShape {
   /** tool call 唯一 ID。 */
   toolCallId: string;
   /** tool 名称。 */
   toolName: string;
   /** tool 输入。 */
   input: unknown;
 }

 /**
  * buildAssistantMessage 的结果参数。
  */
 export interface BuildAssistantMessageResult {
   /** 结束原因。 */
   finishReason: string;
   /** 上游 usage。 */
   usage?: unknown;
   /** tool calls。 */
   toolCalls?: ToolCallShape[];
 }

 /**
  * 构造标准 assistant UIMessage。
  */
 export function buildAssistantMessage(
   text: string,
   ctx: Context,
   result: BuildAssistantMessageResult,
   charge?: AIProviderChargeLine,
 ): { output: UIMessage; charge?: AIProviderChargeLine } {
   const parts: UIMessage["parts"] = [{ type: "text", text }];

   if (result.toolCalls) {
     for (const toolCall of result.toolCalls) {
       const part: DynamicToolUIPart = {
         type: "dynamic-tool",
         toolCallId: toolCall.toolCallId,
         toolName: toolCall.toolName,
         state: "input-available",
         input: toolCall.input as Record<string, unknown>,
       };
       parts.push(part);
     }
   }

   return {
     output: {
       id: `msg_${crypto.randomUUID()}`,
       role: "assistant",
       parts,
       metadata: {
         model: ctx.variant?.id,
         city_id: ctx.city?.city_id,
         user_id: ctx.user?.user_id,
         finishReason: result.finishReason,
         usage: result.usage,
       },
     },
     charge,
   };
 }

 /**
  * 提取后的图片信息。
  */
 export interface ExtractedImage {
   /** 图片 URL 或 data URL。 */
   url: string;
   /** 图片 MIME 类型。 */
   media_type: string;
   /** 文件名。 */
   filename?: string;
 }

 /**
  * 构造标准图片 file-parts UIMessage。
  */
 export function buildImageMessage(
   ctx: Context,
   images: ExtractedImage[],
   metadata: Record<string, unknown>,
 ): UIMessage {
   if (images.length === 0) {
     throw new Error("Image provider returned no images");
   }
   const parts: FileUIPart[] = images.map((image) => ({
     type: "file",
     mediaType: image.media_type,
     url: image.url,
     ...(image.filename ? { filename: image.filename } : {}),
   }));

   return {
     id: `msg_${crypto.randomUUID()}`,
     role: "assistant",
     parts,
     metadata: stripUndefined({
       model: ctx.variant?.id,
       city_id: ctx.city?.city_id,
       user_id: ctx.user?.user_id,
       ...metadata,
     }),
   };
 }

 // ===========================================================================
 // Tool 解析
 // ===========================================================================

 /**
  * OpenAI function tools → ai-sdk ToolSet。
  */
 export function buildToolSet(items: Record<string, unknown>[] | undefined): ToolSet | undefined {
   if (!items?.length) return undefined;

   return Object.fromEntries(
     items
       .filter((item): item is {
         type: "function";
         function: { name: string; description?: string; parameters?: unknown };
       } =>
         item.type === "function" && typeof (item as { function?: { name?: unknown } }).function?.name === "string")
       .map((item) => [
         item.function.name,
         tool({
           description: item.function.description ?? "",
           inputSchema: jsonSchema(item.function.parameters ?? {}),
         }),
       ]),
   );
 }

 // ===========================================================================
 // Usage 归一化
 // ===========================================================================

 type UsageRecord = Record<string, unknown>;

 /**
  * 兼容常见 provider usage 字段，归一化为 input_tokens / output_tokens / cached_tokens。
  */
 export function normalizeAIUsage(usage: unknown): {
   input_tokens?: number;
   output_tokens?: number;
   cached_tokens?: number;
 } {
   if (!isRecord(usage)) return {};
   const input_token_details = isRecord(usage.inputTokenDetails) ? usage.inputTokenDetails : undefined;
   const cached_tokens = readNumberFieldValue(usage, [
     "cached_input_tokens",
     "cachedTokens",
     "cached_tokens",
     "prompt_cache_hit_tokens",
   ]) ?? readNestedNumberFieldValue(usage, "inputTokenDetails", [
     "cacheReadTokens",
     "cachedTokens",
   ]) ?? readNestedNumberFieldValue(usage, "prompt_tokens_details", [
     "cached_tokens",
     "cachedTokens",
   ]) ?? readNumberFieldValue(usage, [
     "cachedInputTokens",
   ]);
   const total_input_tokens = readNumberFieldValue(usage, [
     "promptTokens",
     "prompt_tokens",
     "inputTokens",
     "input_tokens",
     "promptTokenCount",
     "prompt_token_count",
   ]);
   const input_tokens = readNumberFieldValue(usage, ["prompt_cache_miss_tokens"])
     ?? (input_token_details ? readNumberFieldValue(input_token_details, [
       "noCacheTokens",
       "inputTokens",
     ]) : undefined)
     ?? readNestedNumberFieldValue(usage, "prompt_tokens_details", [
       "no_cache_tokens",
       "noCacheTokens",
     ])
     ?? (total_input_tokens !== undefined && cached_tokens !== undefined
       ? Math.max(total_input_tokens - cached_tokens, 0)
       : total_input_tokens);

   return {
     ...(input_tokens !== undefined ? { input_tokens } : {}),
     ...readNumberField(usage, [
       "outputTokens",
       "output_tokens",
       "completionTokens",
       "completion_tokens",
       "candidatesTokenCount",
       "candidates_token_count",
     ], "output_tokens"),
     ...(cached_tokens !== undefined ? { cached_tokens } : {}),
   };
 }

 function readNumberField(
   record: UsageRecord,
   keys: string[],
   output_key: "input_tokens" | "output_tokens" | "cached_tokens",
 ): Partial<Record<"input_tokens" | "output_tokens" | "cached_tokens", number>> {
   const value = readNumberFieldValue(record, keys);
   return value !== undefined ? { [output_key]: value } : {};
 }

 function readNumberFieldValue(record: UsageRecord, keys: string[]): number | undefined {
   for (const key of keys) {
     const value = record[key];
     const normalized = Number(value);
     if (Number.isFinite(normalized) && normalized >= 0) {
       return normalized;
     }
   }
   return undefined;
 }

 function readNestedNumberFieldValue(record: UsageRecord, parent: string, keys: string[]): number | undefined {
   const nested = record[parent];
   return isRecord(nested) ? readNumberFieldValue(nested, keys) : undefined;
 }

 // ===========================================================================
 // OpenAI 兼容透传工具
 // ===========================================================================

 type OpenAIChatMessage = {
   role?: unknown;
   content?: unknown;
   [key: string]: unknown;
 };

 /**
  * 给 /chat/completions 透传前规整 body。
  *
  * - 替换 model 为实际上游模型
  * - 当 stream 为 true 时补充 include_usage
  * - 把多模态 content 中的文本片段拼成纯文本（适合不支持 image_url 的上游）
  */
 export function normalizeOpenAICompatibleBody(
   input: Record<string, unknown>,
   model: string,
 ): Record<string, unknown> {
   const stream_options = input.stream === true
     ? {
         ...(isRecord(input.stream_options) ? input.stream_options : {}),
         include_usage: true,
       }
     : input.stream_options;
   return {
     ...input,
     model,
     ...(stream_options !== undefined ? { stream_options } : {}),
     messages: Array.isArray(input.messages)
       ? input.messages.map((message) => normalizeOpenAIMessage(message))
       : input.messages,
   };
 }

 function normalizeOpenAIMessage(message: unknown): unknown {
   if (!message || typeof message !== "object") return message;
   const record = message as OpenAIChatMessage;
   if (record.role !== "user") return record;
   return {
     ...record,
     content: stringifyOpenAIContent(record.content),
   };
 }

 function stringifyOpenAIContent(content: unknown): string {
   if (typeof content === "string") return content;
   if (!Array.isArray(content)) return content == null ? "" : String(content);

   const texts: string[] = [];
   for (const part of content) {
     if (!part || typeof part !== "object") continue;
     const record = part as Record<string, unknown>;
     if (record.type === "text" && typeof record.text === "string") {
       texts.push(record.text);
     }
   }
   return texts.join("\n");
 }

 /**
  * 从 OpenAI-compatible SSE 流中读取最后一个 usage。
  */
 export async function readOpenAICompatibleSseUsage(
   body: ReadableStream<Uint8Array>,
 ): Promise<unknown | undefined> {
   const reader = body.getReader();
   const decoder = new TextDecoder();
   let buffer = "";
   let usage: unknown;

   try {
     while (true) {
       const { done, value } = await reader.read();
       if (done) break;
       buffer += decoder.decode(value, { stream: true });
       const lines = buffer.split(/\r?\n/);
       buffer = lines.pop() ?? "";
       for (const line of lines) {
         const data = parseSseDataLine(line);
         if (!data || data === "[DONE]") continue;
         const parsed = parseJsonObject(data);
         if (parsed && "usage" in parsed) usage = parsed.usage;
       }
     }
     buffer += decoder.decode();
     for (const line of buffer.split(/\r?\n/)) {
       const data = parseSseDataLine(line);
       if (!data || data === "[DONE]") continue;
       const parsed = parseJsonObject(data);
       if (parsed && "usage" in parsed) usage = parsed.usage;
     }
     return usage;
   } finally {
     reader.releaseLock();
   }
 }

 function parseSseDataLine(line: string): string | undefined {
   const trimmed = line.trimStart();
   if (!trimmed.startsWith("data:")) return undefined;
   return trimmed.slice("data:".length).trim();
 }

 function parseJsonObject(value: string): Record<string, unknown> | undefined {
   try {
     const parsed = JSON.parse(value) as unknown;
     return isRecord(parsed) ? parsed : undefined;
   } catch {
     return undefined;
   }
 }
