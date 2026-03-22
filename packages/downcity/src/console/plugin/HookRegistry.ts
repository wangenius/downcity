/**
 * Hook 注册表。
 *
 * 关键点（中文）
 * - 统一收集 Plugin 的事件型 Hook 与变换型 Hook。
 * - 先只支持 emit / transform 两种执行模型，避免过早引入 middleware。
 */

import type { JsonValue } from "@/types/Json.js";
import type {
  PluginEventHook,
  PluginRuntime,
  PluginTransformHook,
} from "@/types/Plugin.js";

type RuntimeResolver = () => PluginRuntime;

type EventHookRecord = {
  pluginName: string;
  handler: PluginEventHook<JsonValue>;
};

type TransformHookRecord = {
  pluginName: string;
  handler: PluginTransformHook<JsonValue>;
};

/**
 * HookRegistry：Hook 注册与运行实现。
 */
export class HookRegistry {
  private readonly runtimeResolver: RuntimeResolver;

  private readonly eventHooks = new Map<string, EventHookRecord[]>();

  private readonly transformHooks = new Map<string, TransformHookRecord[]>();

  constructor(runtimeResolver: RuntimeResolver) {
    this.runtimeResolver = runtimeResolver;
  }

  /**
   * 注册事件型 Hook。
   */
  on(
    hookName: string,
    pluginName: string,
    handler: PluginEventHook<JsonValue>,
  ): void {
    const key = String(hookName || "").trim();
    if (!key) {
      throw new Error("Hook name is required");
    }
    const bucket = this.eventHooks.get(key) || [];
    bucket.push({
      pluginName: String(pluginName || "").trim(),
      handler,
    });
    this.eventHooks.set(key, bucket);
  }

  /**
   * 注册变换型 Hook。
   */
  transform(
    hookName: string,
    pluginName: string,
    handler: PluginTransformHook<JsonValue>,
  ): void {
    const key = String(hookName || "").trim();
    if (!key) {
      throw new Error("Hook name is required");
    }
    const bucket = this.transformHooks.get(key) || [];
    bucket.push({
      pluginName: String(pluginName || "").trim(),
      handler,
    });
    this.transformHooks.set(key, bucket);
  }

  /**
   * 列出已注册 Hook 名称。
   */
  list(): string[] {
    const keys = new Set<string>([
      ...this.eventHooks.keys(),
      ...this.transformHooks.keys(),
    ]);
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }

  /**
   * 触发事件型 Hook。
   */
  async emit<T = JsonValue>(hookName: string, value: T): Promise<void> {
    const key = String(hookName || "").trim();
    if (!key) return;
    const bucket = this.eventHooks.get(key) || [];
    const runtime = this.runtimeResolver();
    for (const item of bucket) {
      await item.handler({
        runtime,
        value: value as JsonValue,
        plugin: item.pluginName,
      });
    }
  }

  /**
   * 运行变换型 Hook。
   */
  async run<T = JsonValue>(hookName: string, value: T): Promise<T> {
    const key = String(hookName || "").trim();
    if (!key) return value;
    const bucket = this.transformHooks.get(key) || [];
    if (bucket.length === 0) return value;
    const runtime = this.runtimeResolver();
    let current = value as JsonValue;
    for (const item of bucket) {
      current = await item.handler({
        runtime,
        value: current,
        plugin: item.pluginName,
      });
    }
    return current as T;
  }
}
