/**
 * ExecutionModelBinding：Town 宿主侧执行模型绑定辅助。
 *
 * 职责说明（中文）
 * - 统一承接平台模型池读取、模型候选列表构建与项目 execution.modelId 校验。
 * - 保证 `Agent` 只接收最终 `LanguageModel`，不再承担模型池查询职责。
 * - 让 CLI、control gateway、前台启动等宿主入口复用同一套模型绑定规则。
 */

import fs from "fs-extra";
import type { DowncityConfig, StoredModelProvider } from "@downcity/agent";
import { assertProjectExecutionTarget } from "@downcity/agent";
import { getDowncityJsonPath } from "@/config/Paths.js";
import { PlatformStore } from "@/platform/store/index.js";

/**
 * 平台模型下拉候选项。
 */
export interface PlatformModelChoice {
  /**
   * 下拉展示文案。
   */
  title: string;
  /**
   * 实际写入 `execution.modelId` 的模型 ID。
   */
  value: string;
}

/**
 * 读取平台模型候选列表。
 *
 * 关键点（中文）
 * - 输出结果面向 CLI/Console 的模型选择界面。
 * - provider 信息会拼到标题中，便于区分同名模型。
 */
export async function listPlatformModelChoices(): Promise<PlatformModelChoice[]> {
  const store = new PlatformStore();
  try {
    const models = store.listModels();
    const providers = await store.listProviders();
    const providerMap = new Map(providers.map((item) => [item.id, item] as const));
    return models
      .map((item) => buildPlatformModelChoice(item.id, item.providerId, providerMap))
      .filter((item): item is PlatformModelChoice => item !== null);
  } finally {
    store.close();
  }
}

function buildPlatformModelChoice(
  modelId: string,
  providerId: string,
  providerMap: Map<string, StoredModelProvider>,
): PlatformModelChoice | null {
  const id = String(modelId || "").trim();
  if (!id) return null;
  const normalizedProviderId = String(providerId || "").trim();
  const providerType = String(providerMap.get(normalizedProviderId)?.type || "").trim();
  const providerLabel = normalizedProviderId
    ? providerType
      ? `${normalizedProviderId} (${providerType})`
      : normalizedProviderId
    : "-";
  return {
    title: `${id} · ${providerLabel}`,
    value: id,
  };
}

/**
 * 断言指定平台模型可用于 agent execution。
 *
 * 关键点（中文）
 * - 当前只校验“存在且未暂停”。
 * - 供应商连通性与 API Key 可用性仍交给真正创建模型实例时再校验。
 */
export function assertPlatformModelReady(modelId: string): void {
  const normalizedModelId = String(modelId || "").trim();
  if (!normalizedModelId) {
    throw new Error("execution.modelId is required");
  }

  const store = new PlatformStore();
  try {
    const model = store.getModel(normalizedModelId);
    if (!model) {
      throw new Error(`Model not found in platform model pool: ${normalizedModelId}`);
    }
    if (model.isPaused === true) {
      throw new Error(`Model is paused: ${normalizedModelId}`);
    }
  } finally {
    store.close();
  }
}

/**
 * 断言项目 execution 绑定已声明且目标模型可用。
 *
 * 关键点（中文）
 * - 这里是 Town 启动/控制面入口的宿主前置校验。
 * - 失败时抛出稳定错误，交由 CLI 或 HTTP 层决定如何展示。
 */
export function assertProjectExecutionModelReady(projectRoot: string): void {
  const config = readProjectDowncityConfig(projectRoot);
  assertProjectExecutionTarget(config);
  const primaryModelId = String(config.execution?.type === "api" ? config.execution.modelId || "" : "").trim();
  if (!primaryModelId) {
    throw new Error(
      'Invalid downcity.json: "execution" is required and must be { "type": "api", "modelId": "..." }',
    );
  }
  assertPlatformModelReady(primaryModelId);
}

function readProjectDowncityConfig(projectRoot: string): DowncityConfig {
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  return fs.readJsonSync(shipJsonPath) as DowncityConfig;
}
