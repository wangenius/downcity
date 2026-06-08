/**
 * Edge DeepSeek Provider。
 *
 * 关键点（中文）
 * - SDK text / stream 通路使用 AI SDK 官方 DeepSeek provider。
 * - OpenAI-compatible 通路仍返回上游 chat/completions Response，供 Agent 通过 CityModel 连接使用。
 * - DeepSeek chat/completions 只接收文本 content；这里在 provider 内部把多模态 content 规整为文本，避免文本模型收到 image_url 后失败。
 */

import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  convertToModelMessages,
  generateText,
  jsonSchema,
  streamText,
  tool,
  type DynamicToolUIPart,
  type ToolSet,
  type UIMessage,
} from "ai";
import { Provider, type Context } from "@downcity/city";

/**
 * DeepSeek Provider 配置。
 */
export interface DeepSeekProviderOptions {
  /** Provider 唯一 ID。 */
  id: string;
  /** DeepSeek API Key 环境变量。 */
  envKey: string;
  /** DeepSeek API base URL。 */
  baseURL?: string;
  /** 默认上游模型 ID。 */
  defaultModelId: string;
}

interface DeepSeekActionInput {
  /** 多轮 UIMessage。 */
  messages?: UIMessage[];
  /** 单轮 prompt。 */
  prompt?: string;
  /** OpenAI function tools。 */
  tools?: Record<string, unknown>[];
}

interface ToolCallShape {
  /** tool call 唯一 ID。 */
  toolCallId: string;
  /** tool 名称。 */
  toolName: string;
  /** tool 输入。 */
  input: unknown;
}

type OpenAIChatMessage = {
  /** OpenAI-compatible 消息角色。 */
  role?: unknown;
  /** OpenAI-compatible 消息内容。 */
  content?: unknown;
  /** 其他上游字段。 */
  [key: string]: unknown;
};

/**
 * 创建 Edge DeepSeek Provider。
 */
export function createDeepSeekProvider(options: DeepSeekProviderOptions): Provider {
  return new Provider(options.id, {
    env: { [options.envKey]: "DeepSeek API Key" },
    text: async (ctx: Context) => {
      const input = ctx.input as DeepSeekActionInput;
      const model = createDeepSeekModel(ctx, options);
      const tools = buildToolSet(input.tools);

      if (tools) {
        const result = await generateText({
          model,
          messages: await convertToModelMessages(input.messages ?? [], { tools }),
          tools,
        });
        return buildAssistantMessage(result.text, ctx, {
          finishReason: result.finishReason,
          usage: result.usage,
          toolCalls: result.toolCalls as ToolCallShape[],
        });
      }

      const result = await generateText({
        model,
        prompt: extractPrompt(input),
        temperature: 1,
      });
      return buildAssistantMessage(result.text, ctx, {
        finishReason: result.finishReason,
        usage: result.usage,
      });
    },
    stream: async (ctx: Context) => {
      const input = ctx.input as DeepSeekActionInput;
      const model = createDeepSeekModel(ctx, options);
      const tools = buildToolSet(input.tools);

      if (tools) {
        return streamText({
          model,
          messages: await convertToModelMessages(input.messages ?? [], { tools }),
          tools,
        }).toUIMessageStreamResponse();
      }

      return streamText({
        model,
        prompt: extractPrompt(input),
        temperature: 1,
      }).toUIMessageStreamResponse();
    },
    openai: async (ctx: Context) => {
      const api_key = readRequiredEnv(ctx, options.envKey);
      const body = normalizeOpenAICompatibleBody(ctx.input, resolveUpstreamModel(ctx, options.defaultModelId));
      const response = await fetch(`${trimTrailingSlash(options.baseURL ?? "https://api.deepseek.com/v1")}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  });
}

function createDeepSeekModel(ctx: Context, options: DeepSeekProviderOptions) {
  return createDeepSeek({
    apiKey: readRequiredEnv(ctx, options.envKey),
    baseURL: options.baseURL,
  }).chat(resolveUpstreamModel(ctx, options.defaultModelId));
}

function readRequiredEnv(ctx: Context, key: string): string {
  const value = ctx.env(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function resolveUpstreamModel(ctx: Context, fallback: string): string {
  return String(ctx.variant?.id || fallback).trim() || fallback;
}

function trimTrailingSlash(value: string): string {
  return String(value || "").replace(/\/+$/, "");
}

function extractPrompt(input: DeepSeekActionInput): string {
  if (typeof input.prompt === "string") return input.prompt;
  return input.messages
    ?.find((message) => message.role === "user")
    ?.parts?.map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n") ?? "";
}

function buildToolSet(items: Record<string, unknown>[] | undefined): ToolSet | undefined {
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

function buildAssistantMessage(
  text: string,
  ctx: Context,
  result: {
    finishReason: string;
    usage?: unknown;
    toolCalls?: ToolCallShape[];
  },
): UIMessage {
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
    id: `msg_${crypto.randomUUID()}`,
    role: "assistant",
    parts,
    metadata: {
      model: ctx.variant?.id,
      town_id: ctx.town?.town_id,
      user_id: ctx.user?.user_id,
      finishReason: result.finishReason,
      usage: result.usage,
    },
  };
}

function normalizeOpenAICompatibleBody(input: Record<string, unknown>, model: string): Record<string, unknown> {
  return {
    ...input,
    model,
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
