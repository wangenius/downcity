/**
 * Voice 插件模型目录封装。
 *
 * 关键点（中文）
 * - 对 plugin 层暴露稳定的 voice 领域接口。
 * - plugin 不直接依赖底层 runtime 文件布局，只依赖这里的领域封装。
 */

import {
  VOICE_MODEL_CATALOG,
  resolveVoiceModelId,
} from "@/plugins/voice/runtime/Catalog.js";

/**
 * 列出内置 voice 模型目录。
 */
export function listVoiceModels(): Array<{
  /**
   * 稳定模型 ID。
   */
  id: string;
  /**
   * 用户可读标签。
   */
  label: string;
  /**
   * 用户可读说明。
   */
  description: string;
}> {
  return VOICE_MODEL_CATALOG.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
  }));
}

/**
 * 解析用户输入的 voice 模型 ID。
 */
export function resolveVoicePluginModelId(input: string): string | null {
  return resolveVoiceModelId(input);
}
