/**
 * CityModel 到 AI SDK LanguageModel 的适配模块。
 *
 * 关键点（中文）
 * - Agent 对外可以接收 CityModel，但 executor 内部仍只处理 AI SDK LanguageModel。
 * - 适配逻辑集中在这里，避免 City 协议散落到 session/executor 各处。
 * - 这里不依赖 @downcity/city，只依赖 @downcity/type 的共享协议。
 */

import {
  CITY_MODEL_INVOKER,
  isCityModel,
  type CityModel,
  type CityModelInvokeInput,
} from "@downcity/type";
import type { LanguageModel, UIMessage, UIMessageChunk } from "ai";

/**
 * Agent SDK 可接受的模型输入。
 */
export type AgentModel = LanguageModel | CityModel;

type ProviderPromptMessage = {
  /**
   * 模型消息角色。
   */
  role?: string;

  /**
   * 模型消息内容。
   */
  content?: unknown;
};

type ProviderStreamController = ReadableStreamDefaultController<Record<string, unknown>>;
type ProviderContentPart = Record<string, unknown>;

function normalizeFinishReason(input: unknown): {
  unified: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
  raw: string | undefined;
} {
  const text = typeof input === "string" ? input : "";
  if (text === "stop" || text === "length" || text === "content-filter" || text === "tool-calls" || text === "error") {
    return { unified: text, raw: text };
  }
  return { unified: "stop", raw: text || "stop" };
}

function stringifyToolInput(input: unknown): string {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input ?? {});
  } catch {
    return "{}";
  }
}

function textFromProviderContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "text")
    .map((part) => String((part as { text?: unknown }).text ?? ""))
    .join("\n")
    .trim();
}

function fileUrlFromProviderPart(part: Record<string, unknown>): string {
  const data = part.data;
  if (data instanceof URL) return data.toString();
  if (typeof data === "string") return data;
  return "";
}

function providerContentToUiParts(content: unknown): UIMessage["parts"] {
  if (!Array.isArray(content)) {
    return [{ type: "text", text: textFromProviderContent(content) }];
  }

  const parts: UIMessage["parts"] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    if (record.type === "text") {
      parts.push({ type: "text", text: String(record.text ?? "") });
      continue;
    }
    if (record.type === "reasoning") {
      parts.push({ type: "reasoning", text: String(record.text ?? "") });
      continue;
    }
    if (record.type === "file") {
      const url = fileUrlFromProviderPart(record);
      if (!url) continue;
      parts.push({
        type: "file",
        mediaType: String(record.mediaType ?? "application/octet-stream"),
        filename: typeof record.filename === "string" ? record.filename : undefined,
        url,
      });
      continue;
    }
    if (record.type === "tool-call") {
      parts.push({
        type: "dynamic-tool",
        toolName: String(record.toolName ?? ""),
        toolCallId: String(record.toolCallId ?? ""),
        state: "input-available",
        input: record.input,
        providerExecuted: Boolean(record.providerExecuted),
      });
    }
  }
  return parts;
}

function providerPromptToMessages(prompt: unknown): UIMessage[] {
  if (!Array.isArray(prompt)) return [];
  return prompt
    .map((message, index): UIMessage | null => {
      if (!message || typeof message !== "object") return null;
      const item = message as ProviderPromptMessage;
      const role = item.role === "system" || item.role === "assistant" ? item.role : "user";
      const parts = providerContentToUiParts(item.content);
      return {
        id: `city-model-message-${String(index)}`,
        role,
        parts,
      };
    })
    .filter((message): message is UIMessage => Boolean(message));
}

function providerOptionsToInput(options: Record<string, unknown>): CityModelInvokeInput {
  return {
    messages: providerPromptToMessages(options.prompt),
    tools: options.tools,
    toolChoice: options.toolChoice,
    providerOptions: options.providerOptions,
  };
}

function textFromUiMessage(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => String((part as { text?: unknown }).text ?? ""))
    .join("\n")
    .trim();
}

function uiMessageToProviderContent(message: UIMessage): ProviderContentPart[] {
  return message.parts.flatMap((part): ProviderContentPart[] => {
    if (part.type === "text") {
      return [{ type: "text", text: String((part as { text?: unknown }).text ?? "") }];
    }
    if (part.type === "reasoning") {
      return [{ type: "reasoning", text: String((part as { text?: unknown }).text ?? "") }];
    }
    if (part.type === "dynamic-tool") {
      const toolPart = part as {
        toolCallId?: unknown;
        toolName?: unknown;
        input?: unknown;
        providerExecuted?: unknown;
      };
      return [{
        type: "tool-call",
        toolCallId: String(toolPart.toolCallId ?? ""),
        toolName: String(toolPart.toolName ?? ""),
        input: stringifyToolInput(toolPart.input),
        providerExecuted: Boolean(toolPart.providerExecuted),
      }];
    }
    return [];
  });
}

function enqueueFinish(
  controller: ProviderStreamController,
  finishReason: unknown,
): void {
  controller.enqueue({
    type: "finish",
    finishReason: normalizeFinishReason(finishReason),
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
    },
  });
}

function enqueueProviderParts(
  controller: ProviderStreamController,
  parts: Record<string, unknown>[],
  state: {
    /**
     * 当前流是否已经发出 stream-start。
     */
    sawStart: boolean;

    /**
     * 当前流是否已经发出 finish。
     */
    sawFinish: boolean;
  },
): void {
  for (const part of parts) {
    if (part.type !== "stream-start" && !state.sawStart) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      state.sawStart = true;
    }
    if (part.type === "stream-start") state.sawStart = true;
    if (part.type === "finish") state.sawFinish = true;
    controller.enqueue(part);
  }
}

function mapUiChunkToProviderParts(chunk: UIMessageChunk): ProviderContentPart[] {
  switch (chunk.type) {
    case "start":
      return [{ type: "stream-start", warnings: [] }];
    case "text-start":
      return [{ type: "text-start", id: chunk.id }];
    case "text-delta":
      return [{ type: "text-delta", id: chunk.id, delta: chunk.delta }];
    case "text-end":
      return [{ type: "text-end", id: chunk.id }];
    case "reasoning-start":
      return [{ type: "reasoning-start", id: chunk.id }];
    case "reasoning-delta":
      return [{ type: "reasoning-delta", id: chunk.id, delta: chunk.delta }];
    case "reasoning-end":
      return [{ type: "reasoning-end", id: chunk.id }];
    case "tool-input-start":
      return [{
        type: "tool-input-start",
        id: chunk.toolCallId,
        toolName: chunk.toolName,
        providerExecuted: chunk.providerExecuted,
        dynamic: chunk.dynamic,
      }];
    case "tool-input-delta":
      return [{
        type: "tool-input-delta",
        id: chunk.toolCallId,
        delta: chunk.inputTextDelta,
      }];
    case "tool-input-available":
      return [{
        type: "tool-call",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        input: stringifyToolInput(chunk.input),
        providerExecuted: chunk.providerExecuted,
        dynamic: chunk.dynamic,
      }];
    case "tool-output-available":
      return [{
        type: "tool-result",
        toolCallId: chunk.toolCallId,
        toolName: "",
        output: { type: "json", value: chunk.output },
        providerExecuted: chunk.providerExecuted,
        dynamic: chunk.dynamic,
      }];
    case "error":
      return [{ type: "error", error: new Error(chunk.errorText) }];
    default:
      return [];
  }
}

function cityModelToLanguageModel(model: CityModel): LanguageModel {
  const invoker = model[CITY_MODEL_INVOKER];
  const languageModel = {
    specificationVersion: "v3",
    provider: "downcity",
    modelId: model.id,
    supportedUrls: {},
    async doGenerate(options) {
      const message = await invoker.text(providerOptionsToInput(options as Record<string, unknown>));
      return {
        content: uiMessageToProviderContent(message),
        finishReason: normalizeFinishReason("stop"),
        usage: {
          inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: undefined,
            text: undefined,
            reasoning: undefined,
          },
        },
        response: {
          modelId: model.id,
        },
        warnings: [],
      };
    },
    async doStream(options) {
      const cityStream = await invoker.stream(providerOptionsToInput(options as Record<string, unknown>));
      return {
        stream: new ReadableStream({
          async start(controller: ProviderStreamController) {
            const reader = cityStream.getReader();
            const state = {
              sawStart: false,
              sawFinish: false,
            };
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const parts = mapUiChunkToProviderParts(value);
                enqueueProviderParts(controller, parts, state);
              }
              if (!state.sawStart) controller.enqueue({ type: "stream-start", warnings: [] });
              if (!state.sawFinish) enqueueFinish(controller, "stop");
              controller.close();
            } catch (error) {
              controller.enqueue({ type: "error", error });
              if (!state.sawFinish) enqueueFinish(controller, "error");
              controller.close();
            } finally {
              reader.releaseLock();
            }
          },
        }),
        response: {
          modelId: model.id,
        },
      };
    },
  };

  return languageModel as unknown as LanguageModel;
}

/**
 * 将 Agent 可接受的模型输入归一为 AI SDK LanguageModel。
 */
export function normalizeAgentModel(model: AgentModel): LanguageModel {
  if (isCityModel(model)) return cityModelToLanguageModel(model);
  return model;
}

/**
 * 从 Agent 模型输入推导展示标签。
 */
export function inferAgentModelLabel(model: AgentModel | undefined): string | undefined {
  if (!model) return undefined;
  if (isCityModel(model)) return model.name || model.id;
  if (typeof model !== "object") return undefined;
  const record = model as Record<string, unknown>;
  const candidates = [
    record.modelId,
    record.model,
    record.id,
    record.name,
    record.label,
  ];
  for (const candidate of candidates) {
    const label = typeof candidate === "string" ? candidate.trim() : "";
    if (label) return label;
  }
  const constructorName =
    model.constructor && typeof model.constructor.name === "string"
      ? model.constructor.name.trim()
      : "";
  return constructorName || "configured-model";
}
