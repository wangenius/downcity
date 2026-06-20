/**
 * `city agent chat` tool 事件摘要格式化。
 *
 * 职责说明（中文）
 * - 将 tool call / tool result / tool error 事件格式化成适合交互式终端展示的简洁文本。
 * - 避免把完整大 JSON 或超长输出直接刷到终端，保持可读性与节奏感。
 * - 为后续继续贴近 Codex CLI / Claude Code 风格保留独立演进边界。
 */

import type { JsonObject, JsonValue } from "@downcity/agent";
import type { AgentChatToolDisplayBlock } from "@/city/types/AgentChatInteractive.js";

const MAX_INLINE_TEXT_LENGTH = 120;
const MAX_JSON_PREVIEW_LENGTH = 160;
const MAX_OBJECT_KEYS_PREVIEW = 4;

function truncate_inline_text(input: string, max_length: number): string {
  const normalized_text = String(input || "").replace(/\s+/g, " ").trim();
  if (normalized_text.length <= max_length) return normalized_text;
  return `${normalized_text.slice(0, Math.max(0, max_length - 3))}...`;
}

function stringify_json_preview(value: JsonValue, max_length: number): string {
  try {
    const json_text = JSON.stringify(value);
    return truncate_inline_text(json_text, max_length);
  } catch {
    return truncate_inline_text(String(value), max_length);
  }
}

function is_json_object(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pick_first_text_field(
  value: JsonObject,
  field_names: string[],
): { label: string; value: string } | null {
  for (const field_name of field_names) {
    const field_value = value[field_name];
    if (typeof field_value === "string" && field_value.trim()) {
      return {
        label: field_name,
        value: truncate_inline_text(field_value, MAX_INLINE_TEXT_LENGTH),
      };
    }
  }
  return null;
}

function summarize_object_shape(value: JsonObject): string {
  const object_keys = Object.keys(value);
  if (object_keys.length === 0) return "{}";
  const preview_keys = object_keys.slice(0, MAX_OBJECT_KEYS_PREVIEW);
  const suffix =
    object_keys.length > MAX_OBJECT_KEYS_PREVIEW
      ? `, +${String(object_keys.length - MAX_OBJECT_KEYS_PREVIEW)}`
      : "";
  return `{${preview_keys.join(", ")}${suffix}}`;
}

function summarize_tool_args(args: JsonValue): string[] {
  if (typeof args === "string" && args.trim()) {
    return [`input: ${truncate_inline_text(args, MAX_INLINE_TEXT_LENGTH)}`];
  }

  if (Array.isArray(args)) {
    return [`input: [${String(args.length)} item${args.length === 1 ? "" : "s"}]`];
  }

  if (is_json_object(args)) {
    const prioritized_field =
      pick_first_text_field(args, ["cmd", "command", "query", "path", "url", "text"]) ||
      pick_first_text_field(args, ["message", "prompt", "pattern", "name"]);
    if (prioritized_field) {
      return [`${prioritized_field.label}: ${prioritized_field.value}`];
    }

    return [
      `input: ${truncate_inline_text(summarize_object_shape(args), MAX_INLINE_TEXT_LENGTH)}`,
      `json: ${stringify_json_preview(args, MAX_JSON_PREVIEW_LENGTH)}`,
    ];
  }

  if (args === null) return [];
  return [`input: ${truncate_inline_text(String(args), MAX_INLINE_TEXT_LENGTH)}`];
}

function summarize_tool_result(result: JsonValue): string[] {
  if (typeof result === "string" && result.trim()) {
    return [`output: ${truncate_inline_text(result, MAX_INLINE_TEXT_LENGTH)}`];
  }

  if (Array.isArray(result)) {
    return [`output: [${String(result.length)} item${result.length === 1 ? "" : "s"}]`];
  }

  if (is_json_object(result)) {
    const prioritized_field =
      pick_first_text_field(result, ["stdout", "output", "text", "message", "summary"]) ||
      pick_first_text_field(result, ["path", "url", "status", "id"]);
    if (prioritized_field) {
      return [`${prioritized_field.label}: ${prioritized_field.value}`];
    }

    return [
      `output: ${truncate_inline_text(summarize_object_shape(result), MAX_INLINE_TEXT_LENGTH)}`,
      `json: ${stringify_json_preview(result, MAX_JSON_PREVIEW_LENGTH)}`,
    ];
  }

  if (result === null) return ["output: null"];
  return [`output: ${truncate_inline_text(String(result), MAX_INLINE_TEXT_LENGTH)}`];
}

/**
 * 格式化 tool 开始事件。
 */
export function format_tool_call_block(params: {
  tool_name: string;
  args: JsonValue;
}): AgentChatToolDisplayBlock {
  return {
    title: `tool ${params.tool_name} running`,
    detail_lines: summarize_tool_args(params.args),
  };
}

/**
 * 格式化 tool 完成事件。
 */
export function format_tool_result_block(params: {
  tool_name: string;
  result: JsonValue;
}): AgentChatToolDisplayBlock {
  return {
    title: `tool ${params.tool_name} done`,
    detail_lines: summarize_tool_result(params.result),
  };
}
