/**
 * Plugin tool 运行时桥接。
 *
 * 关键点（中文）
 * - tool 层不直接持有 agent 或 plugin registry，只通过装配期注入的 PluginPort 调用 action。
 * - 如果 action 返回 AI SDK UIMessage，则抽取 file parts 并入最终 assistant 消息。
 * - 返回给模型的 tool result 只保留短摘要，避免 data URL 等大内容污染上下文。
 */

import type { FileUIPart } from "ai";
import type { JsonObject, JsonValue } from "@/types/common/Json.js";
import type { PluginPort } from "@/plugin/types/Plugin.js";
import type {
  PluginCallInput,
  PluginCallToolResult,
} from "@/executor/tools/plugin/types/PluginTool.js";
import { enqueueAssistantFileParts } from "@executor/SessionRunScope.js";

let plugin_tool_runtime: PluginPort | null = null;

/**
 * 注入 plugin tool 运行时。
 */
export function setPluginToolRuntime(next: PluginPort): void {
  plugin_tool_runtime = next;
}

/**
 * 读取已注入的 plugin tool 运行时。
 */
function require_plugin_tool_runtime(): PluginPort {
  if (plugin_tool_runtime) return plugin_tool_runtime;
  throw new Error(
    "Plugin tool runtime is not initialized. Ensure agent assembly completed before using plugin_call.",
  );
}

/**
 * 判断值是否为普通对象。
 */
function to_json_object(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

/**
 * 判断 UI part 是否为 file part。
 */
function is_file_part(value: unknown): value is FileUIPart {
  const record = to_json_object(value);
  if (!record) return false;
  return (
    record.type === "file" &&
    typeof record.mediaType === "string" &&
    typeof record.url === "string"
  );
}

/**
 * 从 action data 中抽取可落盘的 assistant file parts。
 */
function extract_assistant_file_parts(data: JsonValue | undefined): FileUIPart[] {
  const message = to_json_object(data);
  const parts: unknown[] = Array.isArray(message?.parts) ? message.parts : [];
  return parts.filter(is_file_part);
}

/**
 * 生成给模型读取的短摘要。
 */
function summarize_action_data(data: JsonValue | undefined): JsonObject {
  const message = to_json_object(data);
  const parts: unknown[] = Array.isArray(message?.parts) ? message.parts : [];
  const file_parts = parts.filter(is_file_part);
  if (parts.length > 0) {
    return {
      kind: "ui_message",
      role: typeof message?.role === "string" ? message.role : "assistant",
      part_count: parts.length,
      file_count: file_parts.length,
      files: file_parts.map((part, index) => ({
        index,
        mediaType: part.mediaType,
        filename: typeof part.filename === "string" ? part.filename : "",
        // 关键点（中文）：不把 data URL 或长 URL 原样返回给模型，完整内容只进入 assistant file part。
        has_url: Boolean(part.url),
      })),
    };
  }
  if (data === undefined) return {};
  return {
    kind: "json",
    value: data,
  };
}

/**
 * 调用 plugin action 并桥接最终 assistant file parts。
 */
export async function invokePluginCallTool(
  input: PluginCallInput,
): Promise<PluginCallToolResult> {
  const plugin = String(input.plugin || "").trim();
  const action = String(input.action || "").trim();
  const payload = to_json_object(input.payload ?? {}) ?? {};
  if (!plugin) {
    return {
      success: false,
      plugin,
      action,
      assistant_file_count: 0,
      message: "plugin is required",
      error: "plugin is required",
    };
  }
  if (!action) {
    return {
      success: false,
      plugin,
      action,
      assistant_file_count: 0,
      message: "action is required",
      error: "action is required",
    };
  }

  try {
    const runtime = require_plugin_tool_runtime();
    const result = await runtime.runAction({
      plugin,
      action,
      payload,
    });
    const file_parts = result.success
      ? extract_assistant_file_parts(result.data)
      : [];
    if (file_parts.length > 0) {
      enqueueAssistantFileParts(file_parts);
    }
    return {
      success: result.success,
      plugin,
      action,
      assistant_file_count: file_parts.length,
      message:
        String(result.message || result.error || "").trim() ||
        (result.success ? "plugin action completed" : "plugin action failed"),
      ...(result.error ? { error: result.error } : {}),
      data: summarize_action_data(result.data),
    };
  } catch (error) {
    return {
      success: false,
      plugin,
      action,
      assistant_file_count: 0,
      message: String(error),
      error: String(error),
    };
  }
}
