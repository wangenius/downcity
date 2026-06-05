/**
 * Town 级 plugin 生命周期管理。
 *
 * 关键点（中文）
 * - plugin 启用/关闭属于 Town 全局配置，不应由 agent 自己写入。
 * - 这里把状态落到平台安全配置中，由 Town 统一读写。
 * - 默认策略：未显式关闭时，一律视为启用。
 */

import { PlatformStore } from "@/town/store/index.js";

/**
 * 单个 plugin 的 Town 级生命周期配置。
 */
export interface BayPluginLifecycleItem {
  /**
   * 当前 plugin 是否在 Town 级被启用。
   */
  enabled: boolean;
  /**
   * 最近更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * Town 级 plugin 生命周期配置映射。
 */
export interface TownPluginLifecycleConfig {
  /**
   * 插件生命周期配置对象映射。
   */
  [pluginName: string]: BayPluginLifecycleItem | undefined;
}

const PLUGIN_LIFECYCLE_SETTING_KEY = "plugins.lifecycle";

function normalizeLifecycleItem(input: unknown): BayPluginLifecycleItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (typeof record.enabled !== "boolean") return null;
  return {
    enabled: record.enabled,
    updatedAt: String(record.updatedAt || "").trim() || new Date().toISOString(),
  };
}

function normalizeLifecycleConfig(input: unknown): TownPluginLifecycleConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: TownPluginLifecycleConfig = {};
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
 * 读取 Town 级 plugin 生命周期配置。
 */
export function readTownPluginLifecycleConfig(): TownPluginLifecycleConfig {
  const store = new PlatformStore();
  try {
    return normalizeLifecycleConfig(
      store.getSecureSettingJsonSync<TownPluginLifecycleConfig>(
        PLUGIN_LIFECYCLE_SETTING_KEY,
      ),
    );
  } finally {
    store.close();
  }
}

/**
 * 写入完整 Town 级 plugin 生命周期配置。
 */
export function writeTownPluginLifecycleConfig(
  value: TownPluginLifecycleConfig,
): TownPluginLifecycleConfig {
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
 * 读取单个 plugin 的 Town 级生命周期状态。
 */
export function readTownPluginLifecycleItem(
  pluginName: string,
): BayPluginLifecycleItem | null {
  const key = String(pluginName || "").trim();
  if (!key) return null;
  return readTownPluginLifecycleConfig()[key] || null;
}

/**
 * 判断单个 plugin 是否启用。
 */
export function isTownPluginEnabled(pluginName: string): boolean {
  const item = readTownPluginLifecycleItem(pluginName);
  if (!item) return true;
  return item.enabled === true;
}

/**
 * 设置单个 plugin 的启用态。
 */
export function setBayPluginEnabled(
  pluginName: string,
  enabled: boolean,
): TownPluginLifecycleConfig {
  const key = String(pluginName || "").trim();
  if (!key) {
    throw new Error("pluginName is required");
  }
  const current = readTownPluginLifecycleConfig();
  return writeTownPluginLifecycleConfig({
    ...current,
    [key]: {
      enabled,
      updatedAt: new Date().toISOString(),
    },
  });
}
