/**
 * Agent plugin runtime。
 *
 * 关键点（中文）
 * - Plugin 只属于 Agent：注册即生效，卸载即不可见。
 * - 注册时自动启动 plugin lifecycle；卸载时自动停止 plugin lifecycle。
 * - action、system、hook、resolve 都统一以“已注册且 ready”为生效边界。
 */

import { toPluginView } from "@/plugin/core/PluginCatalog.js";
import type { HookRegistry } from "@/plugin/core/HookRegistry.js";
import type { Plugin } from "@/types/plugin/PluginDefinition.js";
import type { PluginActionResult } from "@/types/plugin/PluginAction.js";
import type {
  AgentPlugins,
  PluginAvailability,
  PluginActionReadView,
  PluginReadView,
  PluginView,
} from "@/types/plugin/PluginRuntime.js";
import type { AgentSessionSystemBlock } from "@/types/agent/SessionTypes.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { JsonValue } from "@/types/common/Json.js";
import type {
  PluginRuntimeRecord,
  PluginSnapshot,
} from "@/types/plugin/PluginState.js";

type ContextResolver = () => AgentContext;

function now_ms(): number {
  return Date.now();
}

function normalize_plugin_name(plugin_name: string): string {
  return String(plugin_name || "").trim();
}

function create_record(plugin: Plugin): PluginRuntimeRecord {
  const current_time = now_ms();
  return {
    plugin,
    state: "ready",
    registered_at: current_time,
    updated_at: current_time,
    chain: Promise.resolve(),
    lifecycle_started: false,
  };
}

function to_plugin_snapshot(record: PluginRuntimeRecord): PluginSnapshot {
  const plugin = record.plugin;
  const last_error = String(record.last_error || "").trim();
  return {
    name: plugin.name,
    title: String(plugin.title || plugin.name || "").trim(),
    description: String(plugin.description || "").trim(),
    status: record.state,
    registered_at: record.registered_at,
    updated_at: record.updated_at,
    ...(last_error ? { last_error } : {}),
  };
}

function update_record_state(
  record: PluginRuntimeRecord,
  state: PluginRuntimeRecord["state"],
  error?: string,
): void {
  record.state = state;
  record.updated_at = now_ms();
  const normalized_error = String(error || "").trim();
  if (normalized_error) {
    record.last_error = normalized_error;
  } else {
    delete record.last_error;
  }
}

async function run_serial(
  record: PluginRuntimeRecord,
  step: () => Promise<void> | void,
): Promise<void> {
  const next = record.chain.then(() => Promise.resolve(step()));
  record.chain = next.then(
    () => undefined,
    () => undefined,
  );
  await next;
}

/**
 * PluginRegistry：Agent plugin 注册、卸载与调用实现。
 */
export class PluginRegistry implements AgentPlugins {
  private readonly contextResolver: ContextResolver;

  private readonly hookRegistry: HookRegistry;

  private readonly pluginInstances: Map<string, Plugin>;

  private readonly records = new Map<string, PluginRuntimeRecord>();

  constructor(params: {
    contextResolver: ContextResolver;
    hookRegistry: HookRegistry;
    pluginInstances: Map<string, Plugin>;
  }) {
    this.contextResolver = params.contextResolver;
    this.hookRegistry = params.hookRegistry;
    this.pluginInstances = params.pluginInstances;
  }

  /**
   * 注册单个 plugin。
   *
   * 说明（中文）
   * - 同名注册表示替换：先卸载旧实例，再注册并启动新实例。
   * - 如果新实例启动失败，会自动回滚为未注册状态并抛错。
   */
  async register(plugin: Plugin): Promise<PluginSnapshot> {
    const key = normalize_plugin_name(plugin.name);
    if (!key) {
      throw new Error("Plugin name is required");
    }
    if (this.records.has(key)) {
      await this.unregister(key);
    }

    const record = create_record(plugin);
    this.records.set(key, record);
    this.register_hooks(plugin);
    this.pluginInstances.set(key, plugin);

    try {
      await this.start_record(record);
      return to_plugin_snapshot(record);
    } catch (error) {
      this.unregister_hooks(key);
      this.records.delete(key);
      this.pluginInstances.delete(key);
      throw error;
    }
  }

  /**
   * 同步挂载 plugin 元信息。
   *
   * 说明（中文）
   * - 仅供 Agent 构造期使用，避免构造函数里 await。
   * - 后续 `startAll()` 会统一启动这些初始 plugin。
   */
  mount(plugin: Plugin): PluginSnapshot {
    const key = normalize_plugin_name(plugin.name);
    if (!key) {
      throw new Error("Plugin name is required");
    }
    if (this.records.has(key)) {
      throw new Error(`Plugin already registered: ${key}`);
    }

    const record = create_record(plugin);
    this.records.set(key, record);
    this.register_hooks(plugin);
    this.pluginInstances.set(key, plugin);
    return to_plugin_snapshot(record);
  }

  /**
   * 卸载指定 plugin。
   */
  async unregister(pluginName: string): Promise<boolean> {
    const key = normalize_plugin_name(pluginName);
    if (!key) return false;
    const record = this.records.get(key);
    if (!record) return false;

    await this.stop_record(record);
    this.unregister_hooks(key);
    this.records.delete(key);
    this.pluginInstances.delete(key);
    return true;
  }

  /**
   * 启动全部已挂载 plugin。
   */
  async startAll(): Promise<PluginSnapshot[]> {
    const snapshots: PluginSnapshot[] = [];
    for (const record of this.records.values()) {
      try {
        await this.start_record(record);
      } catch {
        // 关键点（中文）：单个 plugin 启动失败只影响自身，不能阻断其他 plugin 与 Agent ready。
      }
      snapshots.push(to_plugin_snapshot(record));
    }
    return snapshots;
  }

  /**
   * 卸载全部 plugin。
   */
  async unregisterAll(): Promise<void> {
    for (const name of Array.from(this.records.keys())) {
      await this.unregister(name);
    }
  }

  /**
   * 判断 plugin 是否已注册且 ready。
   */
  isReady(pluginName: string): boolean {
    const record = this.records.get(normalize_plugin_name(pluginName));
    return Boolean(record && record.state === "ready");
  }

  /**
   * 读取单个 plugin 快照。
   */
  status(pluginName: string): PluginSnapshot | null {
    const record = this.records.get(normalize_plugin_name(pluginName));
    return record ? to_plugin_snapshot(record) : null;
  }

  /**
   * 判断 plugin 是否已注册。
   */
  has(pluginName: string): boolean {
    return this.records.has(normalize_plugin_name(pluginName));
  }

  private register_hooks(plugin: Plugin): void {
    const key = normalize_plugin_name(plugin.name);
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

  private unregister_hooks(pluginName: string): void {
    this.hookRegistry.unregisterPlugin(pluginName);
  }

  private async start_record(record: PluginRuntimeRecord): Promise<void> {
    if (record.lifecycle_started) {
      update_record_state(record, "ready");
      return;
    }
    await run_serial(record, async () => {
      if (record.lifecycle_started) {
        update_record_state(record, "ready");
        return;
      }
      try {
        await record.plugin.lifecycle?.start?.(this.contextResolver());
        record.lifecycle_started = true;
        update_record_state(record, "ready");
      } catch (error) {
        update_record_state(record, "error", String(error));
        throw error;
      }
    });
  }

  private async stop_record(record: PluginRuntimeRecord): Promise<void> {
    await run_serial(record, async () => {
      if (!record.lifecycle_started) return;
      try {
        await record.plugin.lifecycle?.stop?.(this.contextResolver());
      } finally {
        record.lifecycle_started = false;
        record.updated_at = now_ms();
      }
    });
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
    return this.records.get(normalize_plugin_name(pluginName))?.plugin || null;
  }

  /**
   * 列出全部 plugin 概览视图。
   */
  list(): PluginView[] {
    return Array.from(this.records.values())
      .map((record) => toPluginView(record.plugin))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 列出全部 plugin 注册快照。
   */
  snapshots(): PluginSnapshot[] {
    return Array.from(this.records.values())
      .map((record) => to_plugin_snapshot(record))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 读取 action metadata。
   */
  private readAction(
    actionName: string,
    action: NonNullable<Plugin["actions"]>[string],
  ): PluginActionReadView {
    return {
      name: actionName,
      description: String(action.description || "").trim(),
      has_input_schema: Boolean(action.input_schema),
      ...(action.input_schema?.json_schema
        ? { input_schema: action.input_schema.json_schema }
        : {}),
      ...(action.examples ? { examples: action.examples } : {}),
      has_command: Boolean(action.command),
      has_api: Boolean(action.api),
    };
  }

  /**
   * 读取 plugin / action metadata。
   */
  read(params: {
    plugin?: string;
    action?: string;
  }): PluginReadView | { plugins: PluginView[] } {
    const pluginName = normalize_plugin_name(params.plugin || "");
    if (!pluginName) {
      return { plugins: this.list() };
    }
    const plugin = this.get(pluginName);
    if (!plugin) {
      return {
        name: pluginName,
        title: pluginName,
        description: "",
        actions: [],
      };
    }
    const actionName = normalize_plugin_name(params.action || "");
    const actions = Object.entries(plugin.actions || {})
      .filter(([name]) => !actionName || name === actionName)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, action]) => this.readAction(name, action));
    return {
      name: plugin.name,
      title: String(plugin.title || plugin.name || "").trim(),
      description: String(plugin.description || "").trim(),
      actions,
    };
  }

  /**
   * 检查 plugin 可用性。
   */
  async availability(pluginName: string): Promise<PluginAvailability> {
    const key = normalize_plugin_name(pluginName);
    const record = this.records.get(key);
    if (!record) {
      return {
        enabled: false,
        available: false,
        reasons: [`Unknown plugin: ${pluginName}`],
      };
    }

    if (record.state !== "ready") {
      return {
        enabled: true,
        available: false,
        reasons: [record.last_error || `Plugin "${record.plugin.name}" is not ready`],
      };
    }

    if (record.plugin.availability) {
      return await record.plugin.availability(this.contextResolver());
    }

    return {
      enabled: true,
      available: true,
      reasons: [],
    };
  }

  /**
   * 按 action schema 校验 payload。
   */
  private parseActionPayload(params: {
    pluginName: string;
    actionName: string;
    payload: JsonValue;
    action: NonNullable<Plugin["actions"]>[string];
  }): PluginActionResult<JsonValue> | { input: JsonValue } {
    const schema = params.action.input_schema?.zod;
    if (!schema) return { input: params.payload };
    const parsed = schema.safeParse(params.payload);
    if (parsed.success) {
      return { input: parsed.data as JsonValue };
    }
    return {
      success: false,
      error: `Invalid payload for ${params.pluginName}.${params.actionName}: ${parsed.error.message}`,
      message: `Invalid payload for ${params.pluginName}.${params.actionName}`,
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
    const key = normalize_plugin_name(params.plugin);
    const record = this.records.get(key);
    if (!record) {
      return {
        success: false,
        error: `Unknown plugin: ${params.plugin}`,
        message: `Unknown plugin: ${params.plugin}`,
      };
    }

    const actionName = normalize_plugin_name(params.action);
    if (!actionName) {
      return {
        success: false,
        error: "action is required",
        message: "action is required",
      };
    }

    if (record.state !== "ready") {
      return {
        success: false,
        error: `Plugin "${record.plugin.name}" is not ready`,
        message: `Plugin "${record.plugin.name}" is not ready`,
      };
    }

    const action = record.plugin.actions?.[actionName];
    if (!action) {
      return {
        success: false,
        error: `Plugin "${record.plugin.name}" does not implement action "${actionName}"`,
        message: `Plugin "${record.plugin.name}" does not implement action "${actionName}"`,
      };
    }

    try {
      const parsed_payload = this.parseActionPayload({
        pluginName: record.plugin.name,
        actionName,
        payload: (params.payload ?? {}) as JsonValue,
        action,
      });
      if (!("input" in parsed_payload)) {
        return parsed_payload;
      }
      const result = await action.execute({
        context: this.contextResolver(),
        input: parsed_payload.input,
        pluginName: record.plugin.name,
        actionName,
      });
      return result;
    } catch (error) {
      return {
        success: false,
        error: String(error),
        message: String(error),
      };
    }
  }

  /**
   * 读取当前生效的 plugin system blocks。
   */
  async systemBlocks(): Promise<AgentSessionSystemBlock[]> {
    const context = this.contextResolver();
    const out: AgentSessionSystemBlock[] = [];
    for (const record of this.records.values()) {
      const plugin = record.plugin;
      if (record.state !== "ready") continue;
      if (typeof plugin.system !== "function") continue;
      try {
        if (typeof plugin.availability === "function") {
          const availability = await plugin.availability(context);
          if (!availability.available) continue;
        }
        const text = String(await plugin.system(context)).trim();
        if (!text) continue;
        out.push({
          source: "plugin",
          name: plugin.name,
          content: text,
        });
      } catch {
        // 单个 plugin system 失败不应阻断 session 主链路。
      }
    }
    return out;
  }
}
