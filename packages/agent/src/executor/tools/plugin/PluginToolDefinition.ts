/**
 * Plugin tools。
 *
 * 设计目标（中文）
 * - plugin_call 是 agent 内置 plugin action 桥，类似 shell tool 的底层能力入口。
 * - tool 只负责 AI SDK 工具协议适配，不理解具体 plugin 的业务语义。
 * - 插件业务输出若包含 UIMessage file parts，会由 bridge 并入最终 assistant 消息。
 */

import { tool } from "ai";
import type { PluginCallInput } from "@/executor/tools/plugin/types/PluginTool.js";
import { invokePluginCallTool, setPluginToolRuntime } from "./PluginToolBridge.js";
import { plugin_call_input_schema } from "./PluginToolSchemas.js";

export { setPluginToolRuntime } from "./PluginToolBridge.js";

/**
 * `plugin_call`：调用已注册 plugin action。
 */
export const plugin_call = tool({
  description:
    "Call a registered agent plugin action. Use this for plugin capabilities such as image generation. Generated files may be attached to the final assistant message automatically.",
  inputSchema: plugin_call_input_schema,
  execute: async (input) => await invokePluginCallTool(input as PluginCallInput),
});

/**
 * Plugin 工具导出集合。
 */
export const plugin_tools = {
  plugin_call,
};
