/**
 * Agent 项目默认配置模板模块。
 *
 * 职责说明（中文）
 * - 集中声明初始化新项目时写入的默认 `downcity.json` 结构。
 * - 为创建流程提供一份稳定、最小可运行的默认配置基线。
 *
 * 边界说明（中文）
 * - 这里的默认值只服务“新项目生成”，不参与运行时多层配置合并。
 * - 业务运行过程中若要读取最终配置，应始终走 `Config.ts` 的装配逻辑。
 */

import type { DowncityConfig } from "@/types/config/DowncityConfig.js";

/**
 * 默认 `downcity.json` 配置。
 *
 * 关键点（中文）
 * - 这是一份“初始化模板”，不是运行时的最终真相来源。
 * - 调用方若只想取某个字段的默认值，也应意识到它可能被用户项目配置覆盖。
 */
export const DEFAULT_DOWNCITY_JSON: DowncityConfig = {
  $schema: "./.downcity/schema/downcity.schema.json",
  id: "downcity",
  version: "1.0.0",
  start: {
    port: 5314,
    host: "0.0.0.0",
  },
  execution: {
    type: "api",
    modelId: "default",
  },
  plugins: {
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
