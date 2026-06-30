/**
 * `downcity.json` Schema 定义模块。
 *
 * 职责说明（中文）
 * - 提供旧版 `downcity.json` 的 JSON Schema 常量。
 * - 保留给迁移场景与编辑器辅助，不再作为新 Agent 项目的默认配置入口。
 *
 * 边界说明（中文）
 * - 这里是静态 schema 常量，不负责运行时配置装配或业务校验逻辑。
 * - 当 schema 与运行时实现存在差异时，应同时更新配置解析与用户文档。
 */
import type { JsonObject } from "@/types/common/Json.js";

/**
 * `downcity.json` 的本地 Schema 常量。
 *
 * 关键点（中文）
 * - 该结构主要面向 legacy 文件的 IDE 校验与用户编辑体验，不替代运行时断言。
 */
export const DOWNCITY_JSON_SCHEMA: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://downcity.ai/schemas/downcity.schema.json",
  title: "Downcity downcity.json",
  type: "object",
  additionalProperties: true,
  properties: {
    $schema: {
      type: "string",
      description:
        "JSON Schema reference for editor/IDE validation (e.g. ./.downcity/schema/downcity.schema.json).",
    },
    id: { type: "string" },
    version: { type: "string" },
    start: {
      type: "object",
      additionalProperties: true,
      properties: {
        port: { type: "integer", minimum: 1, maximum: 65535 },
        host: { type: "string" },
      },
    },
    execution: {
      type: "object",
      additionalProperties: true,
      properties: {
        type: {
          type: "string",
          enum: ["api"],
        },
        modelId: {
          type: "string",
          description:
            "API 执行模式下绑定的 City AIService 模型 ID。",
        },
      },
      required: ["type", "modelId"],
    },
    plugins: {
      type: "object",
      additionalProperties: true,
      properties: {
        chat: {
          type: "object",
          additionalProperties: true,
          properties: {
            queue: {
              type: "object",
              additionalProperties: true,
              properties: {
                maxConcurrency: { type: "integer", minimum: 1, maximum: 32 },
                mergeDebounceMs: { type: "integer", minimum: 0, maximum: 60000 },
                mergeMaxWaitMs: { type: "integer", minimum: 0, maximum: 120000 },
              },
            },
            egress: {
              type: "object",
              additionalProperties: true,
              properties: {
                chatSendMaxCallsPerRun: { type: "integer", minimum: 1, maximum: 500 },
                chatSendIdempotency: { type: "boolean" },
              },
            },
            channels: {
              type: "object",
              additionalProperties: true,
              description:
                "Chat platform channels (Telegram / Feishu / QQ...).",
              properties: {
                telegram: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    enabled: { type: "boolean" },
                    channelAccountId: { type: "string" },
                  },
                },
                feishu: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    enabled: { type: "boolean" },
                    channelAccountId: { type: "string" },
                  },
                },
                qq: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    enabled: { type: "boolean" },
                    channelAccountId: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    llm: {
      type: "object",
      additionalProperties: true,
      properties: {
        providers: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: true,
            properties: {
              type: {
                type: "string",
                enum: [
                  "anthropic",
                  "openai",
                  "deepseek",
                  "gemini",
                  "open-compatible",
                  "open-responses",
                  "moonshot-cn",
                  "moonshot-ai",
                  "kimi-code",
                  "xai",
                  "huggingface",
                  "openrouter",
                ],
              },
              baseUrl: { type: "string" },
              apiKey: { type: "string" },
            },
            required: ["type"],
          },
        },
        models: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: true,
            properties: {
              provider: { type: "string" },
              name: { type: "string" },
              temperature: { type: "number" },
              maxTokens: { type: "number" },
              topP: { type: "number" },
              frequencyPenalty: { type: "number" },
              presencePenalty: { type: "number" },
              anthropicVersion: { type: "string" },
            },
            required: ["provider", "name"],
          },
        },
        logMessages: { type: "boolean" },
      },
      required: ["providers", "models"],
    },
  },
};
