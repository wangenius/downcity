/**
 * OpenAI-compatible Provider 构造工具。
 *
 * 负责把 OpenAI 兼容上游包装成 Downcity 的 SDK 通路：
 * - text   → 返回 AI SDK `UIMessage`
 * - stream → 返回 AI SDK `UIMessageStreamResponse`
 *
 * 关键说明（中文）
 * - `/chat/completions` 仍由 AIService 的自动透传处理
 * - 这里专门补齐 UserClient.ai.text() / stream() 所需的 server 侧 action
 * - 不在请求热路径里做动态导入，减少首请求和冷启动额外开销
 */

import { convertToModelMessages, generateText, jsonSchema, streamText, tool } from "ai";
import type { DynamicToolUIPart, LanguageModel, ToolSet, UIMessage } from "ai";
import type { Context } from "../service.js";
import { Provider } from "./provider.js";

/**
 * OpenAI-compatible Provider 配置。
 */
export interface OpenAICompatibleProviderOptions {
  /** Provider 唯一 ID，用于模型注册和日志标识。 */
  id: string;
  /** 运行时 API Key 对应的环境变量 key。 */
  envKey: string;
  /** OpenAI-compatible 上游 baseURL。 */
  baseURL: string;
  /** 该 Provider 默认绑定的上游模型 ID。 */
  defaultModelId: string;
}

/**
 * OpenAI-compatible client 工厂入参。
 */
export interface OpenAICompatibleClientConfig {
  /** 上游 API Key。 */
  apiKey: string;
  /** 上游 OpenAI-compatible baseURL。 */
  baseURL: string;
  /** Provider 展示名称，通常用于底层 SDK 调试和埋点。 */
  name: string;
}

/**
 * OpenAI-compatible chat client 最小能力约束。
 */
export interface OpenAICompatibleClient {
  /** 根据模型 ID 创建可传给 AI SDK 的 chat model。 */
  chat(modelId: string): LanguageModel;
}

/**
 * OpenAI-compatible client 工厂签名。
 */
export type OpenAICompatibleClientFactory = (
  config: OpenAICompatibleClientConfig,
) => OpenAICompatibleClient;

interface OpenAIActionInput {
  /** 多轮消息列表。 */
  messages?: UIMessage[];
  /** 单轮 prompt 文本。 */
  prompt?: string;
  /** OpenAI function 风格 tools 数组。 */
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

interface ResolvedActionInputWithTools {
  /** 已转换为 ai-sdk ToolSet 的 tools。 */
  tools: ToolSet;
  /** 已转换为模型侧 messages 的消息列表。 */
  messages: Awaited<ReturnType<typeof convertToModelMessages>>;
}

interface ResolvedActionInputWithPrompt {
  /** 供单轮调用使用的 prompt 文本。 */
  prompt: string;
}

type ResolvedActionInput =
  | ResolvedActionInputWithTools
  | ResolvedActionInputWithPrompt;

/**
 * 创建 OpenAI-compatible Provider。
 */
export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions,
  createClient: OpenAICompatibleClientFactory,
): Provider {
  return new Provider(options.id, {
    env: { [options.envKey]: `${options.id} API Key` },
    baseURL: options.baseURL,
    envKey: options.envKey,
    passthroughModel: options.defaultModelId,
    text: createTextAction(options, createClient),
    stream: createStreamAction(options, createClient),
  });
}

/**
 * 读取必填 API Key。
 */
function readApiKey(ctx: Context, key: string): string {
  const value = ctx.env(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

/**
 * 从 input 中提取 prompt 文本。
 */
function extractPrompt(input: Record<string, unknown>): string {
  if (typeof input.prompt === "string") return input.prompt;

  const messages = input.messages as Array<{
    role: string;
    parts?: Array<{ type: string; text?: string }>;
  }> | undefined;

  return messages
    ?.find((message) => message.role === "user")
    ?.parts?.find((part) => part.type === "text")
    ?.text ?? "";
}

/**
 * OpenAI function tools → ai-sdk ToolSet。
 */
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

/**
 * 将输入解析成 prompt 或 tools+messages，供 text / stream 共用。
 */
async function resolveActionInput(input: OpenAIActionInput): Promise<ResolvedActionInput> {
  const tools = buildToolSet(input.tools);
  if (!tools) {
    return { prompt: extractPrompt(input as Record<string, unknown>) };
  }

  return {
    tools,
    messages: await convertToModelMessages(input.messages ?? [], { tools }),
  };
}

/**
 * 创建当前请求的 chat model。
 *
 * 关键说明（中文）
 * - client 工厂本身在模块加载时就已静态绑定
 * - 这里只按当前 env 读取 API Key，避免 key 轮换后继续复用旧值
 */
function createChatModel(
  ctx: Context,
  options: OpenAICompatibleProviderOptions,
  createClient: OpenAICompatibleClientFactory,
): LanguageModel {
  return createClient({
    apiKey: readApiKey(ctx, options.envKey),
    baseURL: options.baseURL,
    name: options.id,
  }).chat(options.defaultModelId);
}

/**
 * generateText 结果 → UIMessage。
 */
function buildMessage(
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
      studio_id: ctx.studio?.studio_id,
      user_id: ctx.user?.user_id,
      finishReason: result.finishReason,
      usage: result.usage,
    },
  };
}

/**
 * 构造 text action。
 */
function createTextAction(
  options: OpenAICompatibleProviderOptions,
  createClient: OpenAICompatibleClientFactory,
) {
  return async (ctx: Context) => {
    const input = ctx.input as OpenAIActionInput;
    const resolvedInput = await resolveActionInput(input);
    const model = createChatModel(ctx, options, createClient);

    if ("tools" in resolvedInput) {
      const result = await generateText({
        model,
        messages: resolvedInput.messages,
        tools: resolvedInput.tools,
      });

      return buildMessage(result.text, ctx, {
        finishReason: result.finishReason,
        usage: result.usage,
        toolCalls: result.toolCalls as ToolCallShape[],
      });
    }

    const result = await generateText({
      model,
      prompt: resolvedInput.prompt,
      temperature: 1,
    });

    return buildMessage(result.text, ctx, {
      finishReason: result.finishReason,
      usage: result.usage,
    });
  };
}

/**
 * 构造 stream action。
 */
function createStreamAction(
  options: OpenAICompatibleProviderOptions,
  createClient: OpenAICompatibleClientFactory,
) {
  return async (ctx: Context) => {
    const input = ctx.input as OpenAIActionInput;
    const resolvedInput = await resolveActionInput(input);
    const model = createChatModel(ctx, options, createClient);

    if ("tools" in resolvedInput) {
      return streamText({
        model,
        messages: resolvedInput.messages,
        tools: resolvedInput.tools,
      }).toUIMessageStreamResponse();
    }

    return streamText({
      model,
      prompt: resolvedInput.prompt,
      temperature: 1,
    }).toUIMessageStreamResponse();
  };
}
