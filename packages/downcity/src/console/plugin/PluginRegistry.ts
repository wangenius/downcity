/**
 * Plugin 注册表。
 *
 * 关键点（中文）
 * - 统一管理 Plugin 注册、可用性检查与显式 Action 运行。
 * - Plugin 自身不维护 runtime 状态机；可用性由 requirements / availability 决定。
 */

import type { AssetRegistry } from "@/console/plugin/AssetRegistry.js";
import type { HookRegistry } from "@/console/plugin/HookRegistry.js";
import type {
  Plugin,
  PluginActionResult,
  PluginAvailability,
  PluginRuntime,
  PluginRuntimeView,
} from "@/types/Plugin.js";
import type { JsonValue } from "@/types/Json.js";

type RuntimeResolver = () => PluginRuntime;

/**
 * PluginRegistry：Plugin 注册与调度实现。
 */
export class PluginRegistry {
  private readonly runtimeResolver: RuntimeResolver;

  private readonly hookRegistry: HookRegistry;

  private readonly assetRegistry: AssetRegistry;

  private readonly plugins = new Map<string, Plugin>();

  constructor(params: {
    runtimeResolver: RuntimeResolver;
    hookRegistry: HookRegistry;
    assetRegistry: AssetRegistry;
  }) {
    this.runtimeResolver = params.runtimeResolver;
    this.hookRegistry = params.hookRegistry;
    this.assetRegistry = params.assetRegistry;
  }

  /**
   * 注册单个 Plugin。
   */
  register(plugin: Plugin): void {
    const key = String(plugin.name || "").trim();
    if (!key) {
      throw new Error("Plugin name is required");
    }
    if (this.plugins.has(key)) {
      throw new Error(`Plugin already registered: ${key}`);
    }
    this.plugins.set(key, plugin);

    for (const [hookName, handlers] of Object.entries(
      plugin.hooks?.pipeline || {},
    )) {
      for (const handler of handlers) {
        this.hookRegistry.pipeline(hookName, key, handler);
      }
    }

    for (const [hookName, handlers] of Object.entries(
      plugin.hooks?.guard || {},
    )) {
      for (const handler of handlers) {
        this.hookRegistry.guard(hookName, key, handler);
      }
    }

    for (const [hookName, handlers] of Object.entries(
      plugin.hooks?.effect || {},
    )) {
      for (const handler of handlers) {
        this.hookRegistry.effect(hookName, key, handler);
      }
    }

    for (const [pointName, handler] of Object.entries(plugin.resolves || {})) {
      this.hookRegistry.resolve(pointName, key, handler);
    }
  }

  /**
   * 运行 pipeline 点。
   */
  async pipeline<T = JsonValue>(pointName: string, value: T): Promise<T> {
    return this.hookRegistry.pipelineValue(pointName, value);
  }

  /**
   * 运行 guard 点。
   */
  async guard<T = JsonValue>(pointName: string, value: T): Promise<void> {
    return this.hookRegistry.guardValue(pointName, value);
  }

  /**
   * 运行 effect 点。
   */
  async effect<T = JsonValue>(pointName: string, value: T): Promise<void> {
    return this.hookRegistry.effectValue(pointName, value);
  }

  /**
   * 运行 resolve 点。
   */
  async resolve<TInput = JsonValue, TOutput = JsonValue>(
    pointName: string,
    value: TInput,
  ): Promise<TOutput> {
    return this.hookRegistry.resolveValue<TInput, TOutput>(pointName, value);
  }

  /**
   * 获取单个 Plugin 定义。
   */
  get(pluginName: string): Plugin | null {
    return this.plugins.get(String(pluginName || "").trim()) || null;
  }

  /**
   * 列出全部 Plugin 运行时视图。
   */
  list(): PluginRuntimeView[] {
    return Array.from(this.plugins.values())
      .map((plugin) => ({
        name: plugin.name,
        title: String(plugin.title || plugin.name || "").trim(),
        description: String(plugin.description || "").trim(),
        actions: Object.keys(plugin.actions || {}).sort((a, b) =>
          a.localeCompare(b),
        ),
        pipelines: Object.keys(plugin.hooks?.pipeline || {}).sort((a, b) =>
          a.localeCompare(b),
        ),
        guards: Object.keys(plugin.hooks?.guard || {}).sort((a, b) =>
          a.localeCompare(b),
        ),
        effects: Object.keys(plugin.hooks?.effect || {}).sort((a, b) =>
          a.localeCompare(b),
        ),
        resolves: Object.keys(plugin.resolves || {}).sort((a, b) =>
          a.localeCompare(b),
        ),
        requiredAssets: Array.isArray(plugin.requirements?.assets)
          ? [...plugin.requirements.assets].sort((a, b) => a.localeCompare(b))
          : [],
        hasSystem: typeof plugin.system === "function",
        hasAvailability: typeof plugin.availability === "function",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 检查 Plugin 可用性。
   */
  async availability(pluginName: string): Promise<PluginAvailability> {
    const plugin = this.get(pluginName);
    if (!plugin) {
      return {
        enabled: false,
        available: false,
        reasons: [`Unknown plugin: ${pluginName}`],
        missingAssets: [],
      };
    }

    if (plugin.availability) {
      return await plugin.availability(this.runtimeResolver());
    }

    const runtime = this.runtimeResolver();
    const pluginConfig = runtime.config.plugins?.[plugin.name];
    const enabled =
      Boolean(pluginConfig) &&
      typeof pluginConfig === "object" &&
      !Array.isArray(pluginConfig) &&
      (pluginConfig as { enabled?: unknown }).enabled !== false;

    if (!enabled) {
      return {
        enabled: false,
        available: false,
        reasons: [`Plugin "${plugin.name}" is disabled`],
        missingAssets: Array.isArray(plugin.requirements?.assets)
          ? [...plugin.requirements.assets]
          : [],
      };
    }

    const missingAssets: string[] = [];
    const reasons: string[] = [];
    for (const assetName of plugin.requirements?.assets || []) {
      const checked = await this.assetRegistry.check(assetName);
      if (!checked.available) {
        missingAssets.push(assetName);
        reasons.push(...checked.reasons);
      }
    }

    return {
      enabled: true,
      available: reasons.length === 0,
      reasons,
      missingAssets,
    };
  }

  /**
   * 运行 Plugin Action。
   */
  async runAction(params: {
    plugin: string;
    action: string;
    payload?: JsonValue;
  }): Promise<PluginActionResult<JsonValue>> {
    const plugin = this.get(params.plugin);
    if (!plugin) {
      return {
        success: false,
        error: `Unknown plugin: ${params.plugin}`,
        message: `Unknown plugin: ${params.plugin}`,
      };
    }

    const actionName = String(params.action || "").trim();
    if (!actionName) {
      return {
        success: false,
        error: "action is required",
        message: "action is required",
      };
    }

    const action = plugin.actions?.[actionName];
    if (!action) {
      return {
        success: false,
        error: `Plugin "${plugin.name}" does not implement action "${actionName}"`,
        message: `Plugin "${plugin.name}" does not implement action "${actionName}"`,
      };
    }

    try {
      return await action.execute({
        runtime: this.runtimeResolver(),
        payload: (params.payload ?? {}) as JsonValue,
        pluginName: plugin.name,
        actionName,
      });
    } catch (error) {
      return {
        success: false,
        error: String(error),
        message: String(error),
      };
    }
  }
}
