/**
 * Plugin 点注册表。
 *
 * 关键点（中文）
 * - 统一管理 pipeline / guard / effect / resolve 四类 plugin 点。
 * - service 只依赖固定执行语义，不再自己拼装扩展调度逻辑。
 */

import type { JsonValue } from "@/types/Json.js";
import type {
  PluginEffectHook,
  PluginGuardHook,
  PluginPipelineHook,
  PluginResolveHook,
  PluginRuntime,
} from "@/types/Plugin.js";

type RuntimeResolver = () => PluginRuntime;
type PluginEnabledChecker = (pluginName: string, runtime: PluginRuntime) => boolean;

type PipelineRecord = {
  pluginName: string;
  handler: PluginPipelineHook<JsonValue>;
};

type GuardRecord = {
  pluginName: string;
  handler: PluginGuardHook<JsonValue>;
};

type EffectRecord = {
  pluginName: string;
  handler: PluginEffectHook<JsonValue>;
};

type ResolveRecord = {
  pluginName: string;
  handler: PluginResolveHook<JsonValue, JsonValue>;
};

/**
 * HookRegistry：Plugin 点注册与执行实现。
 */
export class HookRegistry {
  private readonly runtimeResolver: RuntimeResolver;
  private readonly pluginEnabledChecker: PluginEnabledChecker;

  private readonly pipelineHooks = new Map<string, PipelineRecord[]>();

  private readonly guardHooks = new Map<string, GuardRecord[]>();

  private readonly effectHooks = new Map<string, EffectRecord[]>();

  private readonly resolveHooks = new Map<string, ResolveRecord>();

  constructor(params: {
    runtimeResolver: RuntimeResolver;
    pluginEnabledChecker: PluginEnabledChecker;
  }) {
    this.runtimeResolver = params.runtimeResolver;
    this.pluginEnabledChecker = params.pluginEnabledChecker;
  }

  /**
   * 注册 pipeline 点。
   */
  pipeline(
    pointName: string,
    pluginName: string,
    handler: PluginPipelineHook<JsonValue>,
  ): void {
    const key = String(pointName || "").trim();
    if (!key) {
      throw new Error("Pipeline point name is required");
    }
    const bucket = this.pipelineHooks.get(key) || [];
    bucket.push({
      pluginName: String(pluginName || "").trim(),
      handler,
    });
    this.pipelineHooks.set(key, bucket);
  }

  /**
   * 注册 guard 点。
   */
  guard(
    pointName: string,
    pluginName: string,
    handler: PluginGuardHook<JsonValue>,
  ): void {
    const key = String(pointName || "").trim();
    if (!key) {
      throw new Error("Guard point name is required");
    }
    const bucket = this.guardHooks.get(key) || [];
    bucket.push({
      pluginName: String(pluginName || "").trim(),
      handler,
    });
    this.guardHooks.set(key, bucket);
  }

  /**
   * 注册 effect 点。
   */
  effect(
    pointName: string,
    pluginName: string,
    handler: PluginEffectHook<JsonValue>,
  ): void {
    const key = String(pointName || "").trim();
    if (!key) {
      throw new Error("Effect point name is required");
    }
    const bucket = this.effectHooks.get(key) || [];
    bucket.push({
      pluginName: String(pluginName || "").trim(),
      handler,
    });
    this.effectHooks.set(key, bucket);
  }

  /**
   * 注册 resolve 点。
   *
   * 关键点（中文）
   * - resolve 语义要求单点单处理器，避免 service 侧再做二次仲裁。
   */
  resolve(
    pointName: string,
    pluginName: string,
    handler: PluginResolveHook<JsonValue, JsonValue>,
  ): void {
    const key = String(pointName || "").trim();
    if (!key) {
      throw new Error("Resolve point name is required");
    }
    if (this.resolveHooks.has(key)) {
      throw new Error(`Resolve point already registered: ${key}`);
    }
    this.resolveHooks.set(key, {
      pluginName: String(pluginName || "").trim(),
      handler,
    });
  }

  /**
   * 列出所有已注册 plugin 点。
   */
  list(): string[] {
    const keys = new Set<string>([
      ...this.pipelineHooks.keys(),
      ...this.guardHooks.keys(),
      ...this.effectHooks.keys(),
      ...this.resolveHooks.keys(),
    ]);
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }

  /**
   * 运行 pipeline 点。
   */
  async pipelineValue<T = JsonValue>(pointName: string, value: T): Promise<T> {
    const key = String(pointName || "").trim();
    if (!key) return value;
    const bucket = this.pipelineHooks.get(key) || [];
    if (bucket.length === 0) return value;

    const runtime = this.runtimeResolver();
    let current = value as JsonValue;
    for (const item of bucket) {
      if (!this.pluginEnabledChecker(item.pluginName, runtime)) continue;
      current = await item.handler({
        runtime,
        value: current,
        plugin: item.pluginName,
      });
    }
    return current as T;
  }

  /**
   * 运行 guard 点。
   */
  async guardValue<T = JsonValue>(pointName: string, value: T): Promise<void> {
    const key = String(pointName || "").trim();
    if (!key) return;
    const bucket = this.guardHooks.get(key) || [];
    if (bucket.length === 0) return;

    const runtime = this.runtimeResolver();
    for (const item of bucket) {
      if (!this.pluginEnabledChecker(item.pluginName, runtime)) continue;
      await item.handler({
        runtime,
        value: value as JsonValue,
        plugin: item.pluginName,
      });
    }
  }

  /**
   * 运行 effect 点。
   */
  async effectValue<T = JsonValue>(pointName: string, value: T): Promise<void> {
    const key = String(pointName || "").trim();
    if (!key) return;
    const bucket = this.effectHooks.get(key) || [];
    if (bucket.length === 0) return;

    const runtime = this.runtimeResolver();
    for (const item of bucket) {
      if (!this.pluginEnabledChecker(item.pluginName, runtime)) continue;
      await item.handler({
        runtime,
        value: value as JsonValue,
        plugin: item.pluginName,
      });
    }
  }

  /**
   * 运行 resolve 点。
   */
  async resolveValue<TInput = JsonValue, TOutput = JsonValue>(
    pointName: string,
    value: TInput,
  ): Promise<TOutput> {
    const key = String(pointName || "").trim();
    if (!key) {
      throw new Error("Resolve point name is required");
    }
    const record = this.resolveHooks.get(key);
    if (!record) {
      throw new Error(`No plugin resolver registered for point: ${key}`);
    }
    const runtime = this.runtimeResolver();
    if (!this.pluginEnabledChecker(record.pluginName, runtime)) {
      throw new Error(`No active plugin resolver registered for point: ${key}`);
    }

    return await record.handler({
      runtime,
      value: value as JsonValue,
      plugin: record.pluginName,
    }) as TOutput;
  }
}
