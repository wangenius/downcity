/**
 * CreateRuntimeModel：Town 宿主侧模型工厂。
 *
 * 关键点（中文）
 * - Town 不再实现 provider/model 模型池。
 * - `execution.modelId` 只表示 City AIService 中暴露的 model id。
 * - 真实 provider、密钥、endpoint 与模型实现都由 City 的 AIService 负责。
 */

import type { DowncityConfig } from "@downcity/agent";
import { getLogger } from "@downcity/agent";
import { normalizeAgentModel } from "@downcity/agent/internal/model/CityModelAdapter.js";
import type { LanguageModel } from "ai";
import { createCityAiAgentModel } from "./CityAiServiceBinding.js";

type ModelLogContext = {
  /**
   * 当前 session 标识，用于日志追踪。
   */
  sessionId?: string;
};

type RuntimeModelFactoryInput = {
  /**
   * 当前项目配置。
   *
   * 关键点（中文）
   * - 这里只读取 `execution.modelId`。
   * - 模型能力目录来自 City AIService。
   */
  config: DowncityConfig;

  /**
   * 可选 session run scope。
   *
   * 关键点（中文）
   * - 保留该字段是为了维持宿主调用契约；City AIService 请求日志由 City 侧负责。
   */
  getSessionRunScope?: () => ModelLogContext | undefined;

  /**
   * 宿主显式注入的运行时 env。
   *
   * 关键点（中文）
   * - 用于读取 DOWNCITY_CITY_URL / DOWNCITY_CITY_USER_TOKEN / DOWNCITY_CITY_TOWN_ID。
   * - 不再读取 provider API Key。
   */
  env?: Record<string, string> | NodeJS.ProcessEnv;
};

function normalizeRuntimeEnv(
  env: Record<string, string> | NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv {
  const resolved: NodeJS.ProcessEnv = {};
  if (!env) return resolved;
  for (const [key, value] of Object.entries(env)) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey || value === undefined || value === null) continue;
    resolved[normalizedKey] = String(value);
  }
  return resolved;
}

function readProjectExecutionBinding(
  config: DowncityConfig,
): { type: "api"; modelId: string } | null {
  const execution = config.execution;
  if (!execution || typeof execution !== "object") return null;
  if (execution.type !== "api") return null;
  const modelId = String(execution.modelId || "").trim();
  if (!modelId) return null;
  return {
    type: "api",
    modelId,
  };
}

/**
 * 创建 Agent 可直接使用的模型实例。
 */
export async function createRuntimeModel(
  input: RuntimeModelFactoryInput,
): Promise<LanguageModel> {
  const logger = getLogger();
  const execution = readProjectExecutionBinding(input.config);
  if (!execution) {
    await logger.log("warn", "No agent execution configured");
    throw new Error("No agent execution configured");
  }

  const model = await createCityAiAgentModel({
    modelId: execution.modelId,
    env: normalizeRuntimeEnv(input.env),
  });

  await logger.log(
    "info",
    `[town] city ai model ready: ${execution.modelId}`,
    {
      kind: "city_ai_model_ready",
      modelId: execution.modelId,
      ...(input.getSessionRunScope?.()?.sessionId
        ? { sessionId: input.getSessionRunScope?.()?.sessionId }
        : {}),
    },
  );

  return normalizeAgentModel(model);
}
