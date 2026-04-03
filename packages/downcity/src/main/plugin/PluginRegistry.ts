/**
 * Plugin 注册表。
 *
 * 关键点（中文）
 * - 统一管理 plugin 注册、可用性检查与显式 action 运行。
 * - Plugin 自身不维护独立状态机；可用性由 enabled 配置与 plugin 自定义 availability 决定。
 */

import { isPluginEnabledInConfig } from "@/main/plugin/Activation.js";
import type { HookRegistry } from "@/main/plugin/HookRegistry.js";
import type {
  Plugin,
  PluginActionResult,
  PluginAvailability,
  PluginView,
} from "@/types/Plugin.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { JsonValue } from "@/types/Json.js";

type ContextResolver = () => ExecutionContext;

/**
 * PluginRegistry：plugin 注册与调度实现。
 */
export class PluginRegistry {
  private readonly contextResolver: ContextResolver;

  private readonly hookRegistry: HookRegistry;

  private readonly plugins = new Map<string, Plugin>();

  constructor(params: {
    contextResolver: ContextResolver;
    hookRegistry: HookRegistry;
  }) {
    this.contextResolver = params.contextResolver;
    this.hookRegistry = params.hookRegistry;
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
   * 获取单个 plugin 定义。
   */
  get(pluginName: string): Plugin | null {
    return this.plugins.get(String(pluginName || "").trim()) || null;
  }

  /**
   * 列出全部 plugin 概览视图。
   */
  list(): PluginView[] {
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
        hasSystem: typeof plugin.system === "function",
        hasAvailability: typeof plugin.availability === "function",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 检查 plugin 可用性。
   */
  async availability(pluginName: string): Promise<PluginAvailability> {
    const plugin = this.get(pluginName);
    if (!plugin) {
      return {
        enabled: false,
        available: false,
        reasons: [`Unknown plugin: ${pluginName}`],
      };
    }

    if (plugin.availability) {
      return await plugin.availability(this.contextResolver());
    }

    const context = this.contextResolver();
    const enabled = isPluginEnabledInConfig({
      plugin,
      config: context.config,
    });

    if (!enabled) {
      return {
        enabled: false,
        available: false,
        reasons: [`Plugin "${plugin.name}" is disabled`],
      };
    }
    return {
      enabled: true,
      available: true,
      reasons: [],
    };
  }

  /**
   * 运行 plugin action。
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

    const context = this.contextResolver();
    const enabled = isPluginEnabledInConfig({
      plugin,
      config: context.config,
    });
    if (!enabled && action.allowWhenDisabled !== true) {
      return {
        success: false,
        error: `Plugin "${plugin.name}" is disabled`,
        message: `Plugin "${plugin.name}" is disabled`,
      };
    }

    try {
      return await action.execute({
        context,
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
