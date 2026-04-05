/**
 * skill plugin 配置读取工具。
 *
 * 关键点（中文）
 * - skill 已迁到 plugin 体系，因此发现路径等配置统一从 `plugins.skill` 读取。
 * - 这里负责把原始 JSON 配置归一化成 runtime 可直接消费的稳定结构。
 */

import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type {
  ResolvedSkillPluginConfig,
  SkillPluginConfig,
} from "@/shared/types/SkillPlugin.js";

/**
 * skill plugin 默认配置。
 */
export const DEFAULT_SKILL_PLUGIN_CONFIG: ResolvedSkillPluginConfig = {
  paths: [".agents/skills"],
  allowExternalPaths: false,
};

/**
 * 读取并归一化 skill plugin 配置。
 */
export function readSkillPluginConfig(
  config?: DowncityConfig | null,
): ResolvedSkillPluginConfig {
  const raw = config?.plugins?.skill;
  const skillConfig =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as SkillPluginConfig)
      : null;

  const normalizedPaths = Array.isArray(skillConfig?.paths)
    ? skillConfig.paths
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];

  return {
    paths:
      normalizedPaths.length > 0
        ? normalizedPaths
        : [...DEFAULT_SKILL_PLUGIN_CONFIG.paths],
    allowExternalPaths:
      typeof skillConfig?.allowExternalPaths === "boolean"
        ? skillConfig.allowExternalPaths
        : DEFAULT_SKILL_PLUGIN_CONFIG.allowExternalPaths,
  };
}
