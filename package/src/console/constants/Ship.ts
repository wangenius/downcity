import type { ShipConfig } from "@agent/types/ShipConfig.js";

export const DEFAULT_SHIP_JSON: ShipConfig = {
  $schema: "./.ship/schema/ship.schema.json",
  name: "shipmyagent",
  version: "1.0.0",
  start: {
    port: 5314,
    host: "0.0.0.0",
  },
  model: {
    primary: "default",
  },
  context: {
    messages: {
      keepLastMessages: 30,
      maxInputTokensApprox: 128000,
      archiveOnCompact: true,
      compactRatio: 0.5,
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
      method: "direct",
      queue: {
        maxConcurrency: 2,
        mergeDebounceMs: 600,
        mergeMaxWaitMs: 2000,
      },
      channels: {
        telegram: {
          enabled: false,
          channelAccountId: undefined,
        },
      },
    },
  },
};
