import type { JsonObject } from "@downcity/agent";

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
    sandbox: {
      type: "object",
      additionalProperties: true,
      description:
        "Shell / CLI sandbox boundary configuration for local command execution. Sandbox is always required for shell execution.",
      properties: {
        envAllowlist: {
          type: "array",
          description:
            "Environment variable names that may be exported into the sandbox.",
          items: { type: "string" },
        },
        writablePaths: {
          type: "array",
          description:
            "Writable paths, absolute or relative to the project root.",
          items: { type: "string" },
        },
        networkMode: {
          type: "string",
          enum: ["off", "restricted", "full"],
          description:
            "Network boundary for sandboxed shell execution.",
        },
      },
    },
    plugins: {
      type: "object",
      additionalProperties: true,
      properties: {
        skill: {
          type: "object",
          additionalProperties: true,
          properties: {
            paths: { type: "array", items: { type: "string" } },
            allowExternalPaths: { type: "boolean" },
          },
        },
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
        asr: {
          type: "object",
          additionalProperties: true,
          properties: {
            injectPrompt: { type: "boolean" },
            augmentMessage: { type: "boolean" },
            provider: { type: "string", enum: ["local", "command"] },
            modelId: {
              type: "string",
              enum: [
                "SenseVoiceSmall",
                "paraformer-zh-streaming",
                "whisper-large-v3-turbo",
              ],
            },
            modelsDir: { type: "string" },
            pythonBin: { type: "string" },
            command: { type: "string" },
            language: { type: "string" },
            timeoutMs: { type: "integer", minimum: 1000, maximum: 600000 },
            strategy: {
              type: "string",
              enum: ["auto", "funasr", "transformers-whisper", "command"],
            },
            installedModels: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "SenseVoiceSmall",
                  "paraformer-zh-streaming",
                  "whisper-large-v3-turbo",
                ],
              },
            },
          },
        },
        tts: {
          type: "object",
          additionalProperties: true,
          properties: {
            provider: {
              type: "string",
              enum: ["local"],
            },
            modelId: {
              type: "string",
              enum: ["qwen3-tts-0.6b", "kokoro-82m", "qwen3-tts-1.7b"],
            },
            modelsDir: { type: "string" },
            pythonBin: { type: "string" },
            language: { type: "string" },
            voice: { type: "string" },
            format: {
              type: "string",
              enum: ["wav", "flac"],
            },
            speed: { type: "number", minimum: 0.5, maximum: 2 },
            outputDir: { type: "string" },
            timeoutMs: { type: "integer", minimum: 5000, maximum: 900000 },
            installedModels: {
              type: "array",
              items: {
                type: "string",
                enum: ["qwen3-tts-0.6b", "kokoro-82m", "qwen3-tts-1.7b"],
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
