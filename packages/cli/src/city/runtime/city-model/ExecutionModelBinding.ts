/**
 * ExecutionModelBinding：City 宿主侧 City AIService 模型绑定辅助。
 *
 * 职责说明（中文）
 * - 统一读取 City AIService 模型目录。
 * - 校验项目 `execution.modelId` 是否能在 City AIService 中找到。
 * - City 只保存 model id，不保存 provider、key 或 endpoint。
 */

import fs from "fs-extra";
import type { DowncityConfig } from "@downcity/agent";
import { assertProjectExecutionTarget } from "@downcity/agent";
import { getDowncityJsonPath } from "@/city/config/Paths.js";
import {
  assertCityAiModelReady,
  listCityAiModelChoices,
  type CityAiModelChoice,
} from "@/city/runtime/city-model/CityAiServiceBinding.js";
import { mergeProcessEnvWithPlatformGlobalEnv } from "@/city/env/ProcessEnv.js";

/**
 * City AIService 模型下拉候选项。
 */
export type PlatformModelChoice = CityAiModelChoice;

/**
 * 读取 City AIService 模型候选列表。
 */
export async function listPlatformModelChoices(): Promise<PlatformModelChoice[]> {
  return await listCityAiModelChoices(mergeProcessEnvWithPlatformGlobalEnv());
}

/**
 * 断言指定模型可用于 agent execution。
 */
export async function assertPlatformModelReady(modelId: string): Promise<void> {
  await assertCityAiModelReady(modelId, mergeProcessEnvWithPlatformGlobalEnv());
}

/**
 * 断言项目 execution 绑定已声明且目标模型可用。
 */
export async function assertProjectExecutionModelReady(projectRoot: string): Promise<void> {
  const config = readProjectDowncityConfig(projectRoot);
  assertProjectExecutionTarget(config);
  const primaryModelId = String(config.execution?.type === "api" ? config.execution.modelId || "" : "").trim();
  if (!primaryModelId) {
    throw new Error(
      'Invalid downcity.json: "execution" is required and must be { "type": "api", "modelId": "..." }',
    );
  }
  await assertPlatformModelReady(primaryModelId);
}

function readProjectDowncityConfig(projectRoot: string): DowncityConfig {
  const shipJsonPath = getDowncityJsonPath(projectRoot);
  return fs.readJsonSync(shipJsonPath) as DowncityConfig;
}
