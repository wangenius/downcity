/**
 * Plugin tool 输入 schema。
 *
 * 关键点（中文）
 * - plugin_call 是 agent 内置的最低层 plugin action 桥。
 * - schema 只描述模型需要提交的目标 plugin、action 与 JSON payload。
 */

import { z } from "zod";

export const plugin_call_input_schema = z.object({
  plugin: z.string().describe("Registered plugin name to call, for example image."),
  action: z.string().describe("Plugin action name to execute, for example image_create."),
  payload: z
    .object({})
    .passthrough()
    .optional()
    .default({})
    .describe("JSON payload passed to the plugin action."),
});

export const plugin_read_input_schema = z.object({
  plugin: z
    .string()
    .optional()
    .describe("Registered plugin name to inspect. Omit to list plugins."),
  action: z
    .string()
    .optional()
    .describe("Plugin action name to inspect. Requires plugin."),
});
