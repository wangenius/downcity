/**
 * Town 级 plugin 生命周期管理。
 *
 * 关键点（中文）
 * - plugin 启用/关闭属于 Town 全局配置，不应由 agent 自己写入。
 * - 这里把状态落到平台安全配置中，由 Town 统一读写。
 * - 默认策略：未显式关闭时，一律视为启用。
 */
import { PlatformStore } from "@/town/store/index.js";
const PLUGIN_LIFECYCLE_SETTING_KEY = "plugins.lifecycle";
function normalizeLifecycleItem(input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        return null;
    const record = input;
    if (typeof record.enabled !== "boolean")
        return null;
    return {
        enabled: record.enabled,
        updatedAt: String(record.updatedAt || "").trim() || new Date().toISOString(),
    };
}
function normalizeLifecycleConfig(input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        return {};
    const out = {};
    for (const [pluginName, raw] of Object.entries(input)) {
        const key = String(pluginName || "").trim();
        if (!key)
            continue;
        const item = normalizeLifecycleItem(raw);
        if (!item)
            continue;
        out[key] = item;
    }
    return out;
}
/**
 * 读取 Town 级 plugin 生命周期配置。
 */
export function readTownPluginLifecycleConfig() {
    const store = new PlatformStore();
    try {
        return normalizeLifecycleConfig(store.getSecureSettingJsonSync(PLUGIN_LIFECYCLE_SETTING_KEY));
    }
    finally {
        store.close();
    }
}
/**
 * 写入完整 Town 级 plugin 生命周期配置。
 */
export function writeTownPluginLifecycleConfig(value) {
    const normalized = normalizeLifecycleConfig(value);
    const store = new PlatformStore();
    try {
        store.setSecureSettingJsonSync(PLUGIN_LIFECYCLE_SETTING_KEY, normalized);
        return normalized;
    }
    finally {
        store.close();
    }
}
/**
 * 读取单个 plugin 的 Town 级生命周期状态。
 */
export function readTownPluginLifecycleItem(pluginName) {
    const key = String(pluginName || "").trim();
    if (!key)
        return null;
    return readTownPluginLifecycleConfig()[key] || null;
}
/**
 * 判断单个 plugin 是否启用。
 */
export function isTownPluginEnabled(pluginName) {
    const item = readTownPluginLifecycleItem(pluginName);
    if (!item)
        return true;
    return item.enabled === true;
}
/**
 * 设置单个 plugin 的启用态。
 */
export function setBayPluginEnabled(pluginName, enabled) {
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
//# sourceMappingURL=PluginLifecycle.js.map