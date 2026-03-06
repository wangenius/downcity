import type { ShipConfig } from "@main/types/ShipConfig.js";

export const DEFAULT_SHIP_JSON: ShipConfig = {
  $schema: "./.ship/schema/ship.schema.json",
  name: "shipmyagent",
  version: "1.0.0",
  start: {
    port: 3000,
    host: "0.0.0.0",
    webui: false,
    webport: 3001,
  },
  llm: {
    activeModel: "default",
    providers: {
      default: {
        type: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "${API_KEY}",
      },
    },
    models: {
      default: {
        provider: "default",
        name: "claude-sonnet-4-20250514",
        temperature: 0.7,
      },
    },
  },
  context: {
    messages: {
      keepLastMessages: 30,
      maxInputTokensApprox: 128000,
      archiveOnCompact: true,
    },
  },
  permissions: {
    read_repo: true,
    write_repo: {
      requiresApproval: false,
    },
    exec_command: {
      deny: ["rm"],
      requiresApproval: false,
      denyRequiresApproval: true,
      maxOutputChars: 12000,
      maxOutputLines: 200,
    },
  },
  services: {
    chat: {
      queue: {
        maxConcurrency: 2,
      },
      channels: {
        telegram: {
          enabled: false,
          botToken: undefined,
          chatId: undefined,
        },
      },
    },
  },
};
