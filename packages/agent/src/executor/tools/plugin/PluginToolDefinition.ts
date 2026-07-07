/**
 * Plugin tools。
 *
 * 设计目标（中文）
 * - plugin_call 是 agent 内置 plugin action 桥，类似 shell tool 的底层能力入口。
 * - tool 只负责 AI SDK 工具协议适配，不理解具体 plugin 的业务语义。
 * - 插件业务输出若包含 UIMessage file parts，会由 bridge 并入最终 assistant 消息。
 */

import { tool } from "ai";
import type {
  PluginCallInput,
  PluginReadInput,
} from "@/executor/tools/plugin/types/PluginTool.js";
import type {
  AgentPluginTools,
  CreatePluginToolsOptions,
} from "@/types/plugin/PluginToolRuntime.js";
import {
  invokePluginCallTool,
  invokePluginReadTool,
} from "./PluginToolBridge.js";
import {
  plugin_call_input_schema,
  plugin_read_input_schema,
} from "./PluginToolSchemas.js";

/**
 * 创建 `plugin_call`：调用当前 Agent 已注册 plugin action。
 */
export function createPluginCallTool(options: CreatePluginToolsOptions) {
  return tool({
    description:
      "Call a registered agent plugin action. Use plugin_read first when you need the action list, input schema, or examples. Generated files may be attached to the final assistant message automatically.",
    inputSchema: plugin_call_input_schema,
    execute: async (input) =>
      await invokePluginCallTool({
        plugins: options.plugins,
        input: input as PluginCallInput,
      }),
  });
}

/**
 * 创建 `plugin_read`：读取当前 Agent 已注册 plugin / action metadata。
 */
export function createPluginReadTool(options: CreatePluginToolsOptions) {
  return tool({
    description:
      "Read registered agent plugin metadata, including action names, descriptions, input schemas, and examples. Use this before plugin_call when the payload shape is unclear.",
    inputSchema: plugin_read_input_schema,
    execute: async (input) =>
      await invokePluginReadTool({
        plugins: options.plugins,
        input: input as PluginReadInput,
      }),
  });
}

/**
 * 创建当前 Agent 专属 Plugin 工具集合。
 */
export function createPluginTools(
  options: CreatePluginToolsOptions,
): AgentPluginTools {
  return {
    plugin_call: createPluginCallTool(options),
    plugin_read: createPluginReadTool(options),
  };
}
