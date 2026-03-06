/**
 * ModelCommand：命令层模型能力入口。
 *
 * 关键点（中文）
 * - commands 不直接访问模型预设常量，统一通过该模块获取。
 * - 底层委托给 llm/ModelManager，命令层只关心交互与配置生成需要的数据形状。
 */

import type { LlmProviderType } from "@main/types/LlmConfig.js";
import {
  ModelManager,
  type ModelPreset,
} from "@main/llm/ModelManager.js";

const manager = new ModelManager();

/**
 * Init 交互选择项。
 */
export type InitModelChoice = {
  /**
   * 展示标题。
   */
  title: string;

  /**
   * 选择值（模型预设 ID）。
   */
  value: string;
};

/**
 * Init 模型解析结果。
 */
export type ResolvedInitModel = {
  /**
   * 最终采用的模型预设 ID。
   */
  modelId: string;

  /**
   * provider 类型（写入 `llm.providers.<id>.type`）。
   */
  providerType: LlmProviderType;

  /**
   * 是否由环境变量注入模型名（`LLM_MODEL`）。
   */
  useCustomModelName: boolean;

  /**
   * 预设标题（用于提示信息输出）。
   */
  title: string;
};

/**
 * 获取 init 的模型选择列表。
 */
export function listInitModelChoices(): InitModelChoice[] {
  return manager.listPresets().map((preset) => ({
    title: preset.title,
    value: preset.id,
  }));
}

/**
 * 获取 init 默认选择索引。
 */
export function getInitModelDefaultIndex(): number {
  const presets = manager.listPresets();
  const defaultId = manager.getDefaultPreset().id;
  const index = presets.findIndex((preset) => preset.id === defaultId);
  return index >= 0 ? index : 0;
}

/**
 * 解析 init 的模型输入。
 */
export function resolveInitModel(input?: string): ResolvedInitModel {
  const resolved = manager.resolveInitPreset(input);
  return {
    modelId: resolved.preset.id,
    providerType: resolved.preset.providerType,
    useCustomModelName: resolved.preset.useCustomModelName,
    title: resolved.preset.title,
  };
}

/**
 * 列出模型预设（供其他命令扩展使用）。
 */
export function listModelPresets(): ModelPreset[] {
  return manager.listPresets();
}
