import type { JsonObject } from "@/types/Json.js";

export const SHIP_JSON_SCHEMA: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://shipmyagent.dev/schemas/ship.schema.json",
  title: "ShipMyAgent ship.json",
  type: "object",
  additionalProperties: true,
  properties: {
    $schema: {
      type: "string",
      description:
        "JSON Schema reference for editor/IDE validation (e.g. ./.ship/schema/ship.schema.json).",
    },
    name: { type: "string" },
    version: { type: "string" },
    description: { type: "string" },
    start: {
      type: "object",
      additionalProperties: true,
      properties: {
        port: { type: "integer", minimum: 1, maximum: 65535 },
        host: { type: "string" },
      },
    },
    services: {
      type: "object",
      additionalProperties: true,
      properties: {
        skills: {
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
            method: { type: "string", enum: ["cmd", "direct"], default: "direct" },
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
                    botToken: { type: "string" },
                    auth_id: { type: "string" },
                    followupWindowMs: { type: "number" },
                    groupAccess: { type: "string", enum: ["initiator_or_admin", "anyone"] },
                  },
                },
                discord: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    enabled: { type: "boolean" },
                    botToken: { type: "string" },
                  },
                },
                feishu: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    enabled: { type: "boolean" },
                    appId: { type: "string" },
                    appSecret: { type: "string" },
                    domain: { type: "string" },
                    auth_id: { type: "string" },
                  },
                },
                qq: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    enabled: { type: "boolean" },
                    appId: { type: "string" },
                    appSecret: { type: "string" },
                    sandbox: { type: "boolean" },
                    auth_id: { type: "string" },
                    groupAccess: { type: "string", enum: ["initiator_or_admin", "anyone"] },
                  },
                },
              },
            },
          },
        },
      },
    },
    extensions: {
      type: "object",
      additionalProperties: true,
      properties: {
        voice: {
          type: "object",
          additionalProperties: true,
          properties: {
            enabled: { type: "boolean" },
            provider: { type: "string", enum: ["local"] },
            activeModel: {
              type: "string",
              enum: [
                "SenseVoiceSmall",
                "paraformer-zh-streaming",
                "whisper-large-v3-turbo",
              ],
            },
            modelsDir: { type: "string" },
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
            transcribe: {
              type: "object",
              additionalProperties: true,
              properties: {
                strategy: {
                  type: "string",
                  enum: [
                    "auto",
                    "funasr",
                    "transformers-whisper",
                    "command",
                  ],
                },
                command: { type: "string" },
                timeoutMs: { type: "integer", minimum: 1000, maximum: 600000 },
                pythonBin: { type: "string" },
                language: { type: "string" },
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
        activeModel: { type: "string" },
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
                  "moonshot",
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
      required: ["activeModel", "providers", "models"],
    },
    context: {
      type: "object",
      additionalProperties: true,
      properties: {
        messages: {
          type: "object",
          additionalProperties: true,
          properties: {
            keepLastMessages: { type: "integer", minimum: 6, maximum: 5000 },
            maxInputTokensApprox: { type: "integer", minimum: 2000, maximum: 200000 },
            archiveOnCompact: { type: "boolean" },
            compactRatio: { type: "number", minimum: 0.1, maximum: 0.9 },
          },
        },
      },
    },
    permissions: {
      type: "object",
      additionalProperties: true,
      properties: {
        read_repo: {
          anyOf: [
            { type: "boolean" },
            {
              type: "object",
              additionalProperties: true,
              properties: { paths: { type: "array", items: { type: "string" } } },
            },
          ],
        },
        write_repo: {
          anyOf: [
            { type: "boolean" },
            {
              type: "object",
              additionalProperties: true,
              properties: {
                paths: { type: "array", items: { type: "string" } },
                requiresApproval: { type: "boolean" },
              },
              required: ["requiresApproval"],
            },
          ],
        },
        exec_command: {
          anyOf: [
            { type: "boolean" },
            {
              type: "object",
              additionalProperties: true,
              properties: {
                deny: { type: "array", items: { type: "string" } },
                allow: { type: "array", items: { type: "string" } },
                requiresApproval: { type: "boolean" },
                maxOutputChars: { type: "integer", minimum: 500, maximum: 200000 },
                maxOutputLines: { type: "integer", minimum: 20, maximum: 5000 },
              },
              required: ["requiresApproval"],
            },
          ],
        },
        open_pr: { type: "boolean" },
        merge: { type: "boolean" },
      },
    },
  },
};
