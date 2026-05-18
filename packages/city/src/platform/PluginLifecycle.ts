/**
 * City 级 plugin 生命周期管理。
 *
 * 关键点（中文）
 * - plugin 启用/关闭属于 city 全局配置，不应由 agent 自己写入。
 * - 这里把状态落到平台安全配置中，由 city 统一读写。
 * - 默认策略：未显式关闭时，一律视为启用。
 */

import { PlatformStore } from "@/platform/store/index.js";

/**
 * 单个 plugin 的 city 级生命周期配置。
 */
export interface CityPluginLifecycleItem {
  /**
   * 当前 plugin 是否在 city 级被启用。
   */
  enabled: boolean;
  /**
   * 最近更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * city 级 plugin 生命周期配置映射。
 */
export interface CityPluginLifecycleConfig {
  /**
   * 插件生命周期配置对象映射。
   */
  [pluginName: string]: CityPluginLifecycleItem | undefined;
}

const PLUGIN_LIFECYCLE_SETTING_KEY = "plugins.lifecycle";

function normalizeLifecycleItem(input: unknown): CityPluginLifecycleItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (typeof record.enabled !== "boolean") return null;
  return {
    enabled: record.enabled,
    updatedAt: String(record.updatedAt || "").trim() || new Date().toISOString(),
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
 * 读取 city 级 plugin 生命周期配置。
 */
export function readCityPluginLifecycleConfig(): CityPluginLifecycleConfig {
  const store = new PlatformStore();
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
 * 写入完整 city 级 plugin 生命周期配置。
 */
export function writeCityPluginLifecycleConfig(
  value: CityPluginLifecycleConfig,
): CityPluginLifecycleConfig {
  const normalized = normalizeLifecycleConfig(value);
  const store = new PlatformStore();
  try {
    store.setSecureSettingJsonSync(PLUGIN_LIFECYCLE_SETTING_KEY, normalized);
    return normalized;
  } finally {
    store.close();
  }
}

/**
 * 读取单个 plugin 的 city 级生命周期状态。
 */
export function readCityPluginLifecycleItem(
  pluginName: string,
): CityPluginLifecycleItem | null {
  const key = String(pluginName || "").trim();
  if (!key) return null;
  return readCityPluginLifecycleConfig()[key] || null;
}

/**
 * 判断单个 plugin 是否启用。
 */
export function isCityPluginEnabled(pluginName: string): boolean {
  const item = readCityPluginLifecycleItem(pluginName);
  if (!item) return true;
  return item.enabled === true;
}

/**
 * 设置单个 plugin 的启用态。
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
