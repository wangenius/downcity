/**
 * Defaults：agent 项目默认配置模板。
 *
 * 关键点（中文）
 * - 这里集中声明初始化项目时写入的默认 `downcity.json`。
 * - 默认值只服务项目初始化，不参与运行时配置合并逻辑。
 */

import type { DowncityConfig } from "@/types/config/DowncityConfig.js";

/**
 * 默认 `downcity.json` 配置。
 */
export const DEFAULT_DOWNCITY_JSON: DowncityConfig = {
  $schema: "./.downcity/schema/downcity.schema.json",
  name: "downcity",
  version: "1.0.0",
  start: {
    port: 5314,
    host: "0.0.0.0",
  },
  execution: {
    type: "api",
    modelId: "default",
  },
  context: {
    messages: {
      keepLastMessages: 30,
      maxInputTokensApprox: 128000,
      archiveOnCompact: true,
      compactRatio: 0.5,
    },
  },
  services: {
    chat: {
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
