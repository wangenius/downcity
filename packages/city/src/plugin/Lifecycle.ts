/**
 * Plugin 生命周期配置模块。
 *
 * 关键点（中文）
 * - Plugin enable/disable 属于 city 级全局配置，不再写入 agent `downcity.json`。
 * - 当前实现把 lifecycle 配置存入 ConsoleStore 的统一 JSON 设置。
 * - 默认策略：除显式关闭外，内建 plugin 视为启用。
 */

import { ConsoleStore } from "@/shared/utils/store/index.js";
import type {
  CityPluginLifecycleConfig,
  CityPluginLifecycleItem,
} from "@/shared/types/PluginLifecycle.js";

const PLUGIN_LIFECYCLE_SETTING_KEY = "plugins.lifecycle";

function normalizeLifecycleItem(input: unknown): CityPluginLifecycleItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (typeof record.enabled !== "boolean") return null;
  const updatedAt = String(record.updatedAt || "").trim() || new Date().toISOString();
  return {
    enabled: record.enabled,
    updatedAt,
  };
}

function normalizeLifecycleConfig(input: unknown): CityPluginLifecycleConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: CityPluginLifecycleConfig = {};
  for (const [pluginName, raw] of Object.entries(input as Record<string, unknown>)) {
    const key = String(pluginName || "").trim();
    if (!key) continue;
    const item = normalizeLifecycleItem(raw);
    if (!item) continue;
    out[key] = item;
  }
  return out;
}

/**
 * 读取当前 city 级 plugin lifecycle 配置。
 */
export function readCityPluginLifecycleConfig(): CityPluginLifecycleConfig {
  const store = new ConsoleStore();
  try {
    return normalizeLifecycleConfig(
      store.getSecureSettingJsonSync<CityPluginLifecycleConfig>(
        PLUGIN_LIFECYCLE_SETTING_KEY,
      ),
    );
  } finally {
    store.close();
  }
}

/**
 * 写入完整 city 级 plugin lifecycle 配置。
 */
export function writeCityPluginLifecycleConfig(
  value: CityPluginLifecycleConfig,
): CityPluginLifecycleConfig {
  const normalized = normalizeLifecycleConfig(value);
  const store = new ConsoleStore();
  try {
    store.setSecureSettingJsonSync(PLUGIN_LIFECYCLE_SETTING_KEY, normalized);
    return normalized;
  } finally {
    store.close();
  }
}

/**
 * 读取单个 plugin 的 city 级 lifecycle 状态。
 */
export function readCityPluginLifecycleItem(
  pluginName: string,
): CityPluginLifecycleItem | null {
  const key = String(pluginName || "").trim();
  if (!key) return null;
  return readCityPluginLifecycleConfig()[key] || null;
}

/**
 * 读取单个 plugin 是否启用。
 *
 * 关键点（中文）
 * - 除显式关闭外，一律默认启用。
 */
export function isCityPluginEnabled(pluginName: string): boolean {
  const item = readCityPluginLifecycleItem(pluginName);
  if (!item) return true;
  return item.enabled === true;
}

/**
 * 设置单个 plugin 的 city 级启用态。
 */
export function setCityPluginEnabled(
  pluginName: string,
  enabled: boolean,
): CityPluginLifecycleConfig {
  const key = String(pluginName || "").trim();
  if (!key) {
    throw new Error("pluginName is required");
  }
  const current = readCityPluginLifecycleConfig();
  return writeCityPluginLifecycleConfig({
    ...current,
    [key]: {
      enabled,
      updatedAt: new Date().toISOString(),
    },
  });
}
