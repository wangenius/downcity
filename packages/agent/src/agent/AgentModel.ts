/**
 * AgentModel：Agent 与 Session 统一使用的运行时模型协议。
 *
 * 关键点（中文）
 * - Agent 与 Session 对外统一接收 AgentModel，executor 内部只处理 AI SDK LanguageModel。
 * - CityModel 保留模型目录信息；运行时连接信息通过隐藏协议提供。
 * - 这里直接创建 OpenAI-compatible LanguageModel，不再保留旧的 text/stream 反向适配。
 * - 这里不依赖 @downcity/city，只依赖 @downcity/type 的共享协议。
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  CITY_MODEL_INVOKER,
  isCityModel,
  type CityModel,
} from "@downcity/type";
import type { LanguageModel } from "ai";

/** 已完成转换的 CityModel 与 LanguageModel 对应关系。 */
const normalized_models = new WeakMap<object, LanguageModel>();

/**
 * Agent SDK 可接受的模型输入。
 */
export type AgentModel = LanguageModel | CityModel;

/**
 * 将 CityModel 的 hidden connection 转换为 AI SDK LanguageModel。
 */
function cityModelToLanguageModel(model: CityModel): LanguageModel {
  const connection = model[CITY_MODEL_INVOKER].connection();
  const provider = createOpenAICompatible({
    name: "downcity",
    baseURL: connection.base_url,
    apiKey: connection.api_key,
  });
  return provider.languageModel(connection.model_id) as LanguageModel;
}

/**
 * 将 Agent 可接受的模型输入归一为 AI SDK LanguageModel。
 */
export function normalizeAgentModel(model: AgentModel): LanguageModel {
  if (isCityModel(model)) {
    const cached = normalized_models.get(model);
    if (cached) return cached;
    const normalized = cityModelToLanguageModel(model);
    normalized_models.set(model, normalized);
    return normalized;
  }
  return model;
}

/**
 * 从 Agent 模型输入读取已声明的上下文窗口。
 *
 * 只有 CityModel 携带可信的模型目录元数据；普通 AI SDK LanguageModel 未声明时返回空。
 */
export function read_agent_model_context_window(
  model: AgentModel | undefined,
): number | undefined {
  if (!model || !isCityModel(model)) return undefined;
  const context_window = model.context_window;
  return Number.isSafeInteger(context_window) && Number(context_window) > 0
    ? Number(context_window)
    : undefined;
}

/**
 * 从 Agent 模型输入推导展示标签。
 */
export function inferAgentModelLabel(model: AgentModel | undefined): string | undefined {
  if (!model) return undefined;
  if (isCityModel(model)) return model.name || model.id;
  if (typeof model !== "object") return undefined;
  const record = model as Record<string, unknown>;
  const candidates = [
    record.modelId,
    record.model,
    record.id,
    record.name,
    record.label,
  ];
  for (const candidate of candidates) {
    const label = typeof candidate === "string" ? candidate.trim() : "";
    if (label) return label;
  }
  const constructorName =
    model.constructor && typeof model.constructor.name === "string"
      ? model.constructor.name.trim()
      : "";
  return constructorName || "configured-model";
}
