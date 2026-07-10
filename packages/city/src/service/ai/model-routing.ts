/**
 * AI 模型媒体 fallback 路由模块。
 *
 * 该模块只读取请求中的媒体信息并选择最终模型，不修改请求体，也不处理推理参数。
 * 推理强度必须在本模块返回最终模型后再由 AIService 解析。
 */

import { isRecord } from "./helpers.js";
import type { ModelFallbackMedia, ModelFallbackRule } from "./types.js";
import type {
  AIModelRoutingAdapter,
  AIResolvedAction,
  AIResolvedRoutingPlan,
} from "../../types/AIRouting.js";

/** 按请求媒体输入和模型级 fallback 规则决定最终模型。 */
export function resolve_text_routing_plan(
  resolved: AIResolvedAction,
  input: Record<string, unknown>,
  mode: string,
  adapter: AIModelRoutingAdapter,
): AIResolvedRoutingPlan {
  const model = resolved.model;
  if (!model?.fallback?.length) return { resolved };

  const media_inputs = extract_media_inputs(input, mode);
  if (media_inputs.length === 0) return { resolved };

  for (const rule of model.fallback) {
    for (const media of media_inputs) {
      const plan = resolve_media_fallback_plan(model.id, rule, media, mode, adapter);
      if (plan) return plan;
    }
  }
  return { resolved };
}

/** 根据单条规则和媒体输入生成 fallback 计划。 */
function resolve_media_fallback_plan(
  source_model_id: string,
  rule: ModelFallbackRule,
  media: ModelFallbackMedia,
  mode: string,
  adapter: AIModelRoutingAdapter,
): AIResolvedRoutingPlan | undefined {
  if (!matches_fallback_rule(rule, media)) return undefined;
  const fallback_model = adapter.resolve_model(rule.model);
  if (!fallback_model || fallback_model.id === source_model_id) return undefined;
  const action = adapter.resolve_action(fallback_model, mode);
  if (!action || !adapter.is_available(fallback_model)) return undefined;

  return {
    resolved: { model: fallback_model, action },
    fallback_from: source_model_id,
    fallback_reason: "input_requires_media",
    fallback_media_type: media.media_type,
  };
}

/** 安全执行用户提供的 fallback 匹配函数。 */
function matches_fallback_rule(rule: ModelFallbackRule, media: ModelFallbackMedia): boolean {
  try {
    return rule.match(media);
  } catch {
    return false;
  }
}

/** 从 SDK 或 OpenAI-compatible 请求中提取媒体输入。 */
function extract_media_inputs(input: Record<string, unknown>, mode: string): ModelFallbackMedia[] {
  return mode === "openai"
    ? extract_openai_media_inputs(input.messages)
    : extract_ui_media_inputs(input.messages);
}

/** 扫描 OpenAI-compatible messages 的媒体输入。 */
function extract_openai_media_inputs(messages: unknown): ModelFallbackMedia[] {
  if (!Array.isArray(messages)) return [];
  const media_inputs: ModelFallbackMedia[] = [];
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const media = read_openai_media_part(part);
      if (media) media_inputs.push(media);
    }
  }
  return media_inputs;
}

/** 读取 OpenAI-compatible content part 的媒体信息。 */
function read_openai_media_part(part: unknown): ModelFallbackMedia | undefined {
  if (!isRecord(part)) return undefined;
  const type = read_optional_string(part.type);
  if (type === "image_url" || type === "input_image") {
    return build_fallback_media("image/*", { url: read_openai_image_url(part) });
  }
  if (type !== "file") return undefined;
  const media_type = read_part_media_type(part);
  if (!media_type) return undefined;
  return build_fallback_media(media_type, {
    filename: read_optional_string(part.filename),
    url: read_optional_string(part.url),
  });
}

/** 读取 OpenAI-compatible 图片 URL。 */
function read_openai_image_url(part: Record<string, unknown>): string | undefined {
  const direct_url = read_optional_string(part.url);
  if (direct_url) return direct_url;
  return isRecord(part.image_url)
    ? read_optional_string(part.image_url.url)
    : undefined;
}

/** 扫描 UIMessage messages 的 file 媒体输入。 */
function extract_ui_media_inputs(messages: unknown): ModelFallbackMedia[] {
  if (!Array.isArray(messages)) return [];
  const media_inputs: ModelFallbackMedia[] = [];
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (!isRecord(part) || part.type !== "file") continue;
      const media_type = read_part_media_type(part);
      if (!media_type) continue;
      media_inputs.push(build_fallback_media(media_type, {
        filename: read_optional_string(part.filename),
        url: read_optional_string(part.url),
      }));
    }
  }
  return media_inputs;
}

/** 构造不会写入 undefined 字段的 fallback 媒体对象。 */
function build_fallback_media(
  media_type: string,
  optional: { filename?: string; url?: string },
): ModelFallbackMedia {
  return {
    media_type,
    ...(optional.filename ? { filename: optional.filename } : {}),
    ...(optional.url ? { url: optional.url } : {}),
  };
}

/** 读取 content part 的 MIME 类型。 */
function read_part_media_type(part: Record<string, unknown>): string {
  return read_optional_string(part.mediaType)
    ?? read_optional_string(part.media_type)
    ?? "";
}

/** 读取去除首尾空白后的可选字符串。 */
function read_optional_string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
