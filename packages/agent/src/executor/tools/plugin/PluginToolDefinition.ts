/**
 * Plugin tools。
 *
 * 设计目标（中文）
 * - plugin_call 是 agent 内置 plugin action 桥，类似 shell tool 的底层能力入口。
 * - tool 只负责 AI SDK 工具协议适配，不理解具体 plugin 的业务语义。
 * - 插件业务输出若包含 UIMessage file parts，会由 bridge 并入最终 assistant 消息。
 */

import { tool, type ToolExecutionOptions } from "ai";
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
import type { SessionToolExecutionContext } from "@/types/executor/SessionToolExecutionContext.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";

/**
 * 要求当前 plugin tool 具有 Executor 显式绑定的 Session 上下文。
 */
function require_run_context(
  options: ToolExecutionOptions,
): SessionRunContext {
  const execution_context = options.experimental_context as
    | Partial<SessionToolExecutionContext>
    | undefined;
  const run_context = execution_context?.session_run_context;
  if (!run_context) {
    throw new Error("plugin tool requires an explicit session run context");
  }
  return run_context;
}

/**
 * 创建 `plugin_call`：调用当前 Agent 已注册 plugin action。
 */
export function createPluginCallTool(options: CreatePluginToolsOptions) {
  return tool({
    description:
      "Call a registered agent plugin action. Use plugin_read first when you need the action list, input schema, or examples. Generated files may be attached to the final assistant message automatically.",
    inputSchema: plugin_call_input_schema,
    execute: async (input, execution_options) =>
      await invokePluginCallTool({
        plugins: options.plugins,
        run_context: require_run_context(execution_options),
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
    execute: async (input, execution_options) =>
      await invokePluginReadTool({
        plugins: options.plugins,
        run_context: require_run_context(execution_options),
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
