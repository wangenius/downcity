/**
 * Plugin 类型定义。
 *
 * 关键点（中文）
 * - Plugin 是运行时增强单元，不维护独立 runtime 状态机。
 * - Plugin 通过 actions / hooks / capabilities / system 声明行为。
 * - Plugin 只声明依赖哪些 Asset，不直接理解底层资源实现细节。
 */

import type { Command } from "commander";
import type { Context as HonoContext } from "hono";
import type { Logger } from "@utils/logger/Logger.js";
import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type {
  AssetPort,
  AssetRuntimeLike,
  StructuredConfig,
} from "@/types/Asset.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";

/**
 * Service 调用参数。
 */
export interface PluginServiceInvokeParams {
  /**
   * 目标 service 名称。
   */
  service: string;
  /**
   * 目标 action 名称。
   */
  action: string;
  /**
   * 调用 payload（可选）。
   */
  payload?: JsonValue;
}

/**
 * Service 调用结果。
 */
export interface PluginServiceInvokeResult {
  /**
   * 调用是否成功。
   */
  success: boolean;
  /**
   * 结构化返回数据（可选）。
   */
  data?: JsonValue;
  /**
   * 错误信息（可选）。
   */
  error?: string;
}

/**
 * Service 调用端口。
 */
export interface PluginServiceInvokePort {
  /**
   * 调用指定 service action。
   */
  invoke(
    params: PluginServiceInvokeParams,
  ): Promise<PluginServiceInvokeResult>;
}

/**
 * Capability 调用参数。
 */
export interface CapabilityInvokeParams {
  /**
   * Capability 稳定名称。
   */
  capability: string;
  /**
   * 调用 payload（可选）。
   */
  payload?: JsonValue;
}

/**
 * Capability 调用结果。
 */
export interface CapabilityInvokeResult {
  /**
   * 调用是否成功。
   */
  success: boolean;
  /**
   * 结构化返回数据（可选）。
   */
  data?: JsonValue;
  /**
   * 错误信息（可选）。
   */
  error?: string;
}

/**
 * Capability 调用端口。
 */
export interface CapabilityPort {
  /**
   * 列出全部已注册 Capability 名称。
   */
  list(): string[];
  /**
   * 判断 Capability 是否已注册。
   */
  has(capabilityName: string): boolean;
  /**
   * 调用指定 Capability。
   */
  invoke(
    params: CapabilityInvokeParams,
  ): Promise<CapabilityInvokeResult>;
}

/**
 * Plugin 运行时概览。
 */
export interface PluginRuntimeView {
  /**
   * Plugin 稳定名称。
   */
  name: string;
  /**
   * Plugin Action 名称列表。
   */
  actions: string[];
  /**
   * Plugin Capability 名称列表。
   */
  capabilities: string[];
  /**
   * Plugin 依赖 Asset 名称列表。
   */
  requiredAssets: string[];
  /**
   * 是否声明了 system 注入。
   */
  hasSystem: boolean;
  /**
   * 是否声明了 availability 检查。
   */
  hasAvailability: boolean;
}

/**
 * Plugin 可用性结果。
 */
export interface PluginAvailability {
  /**
   * Plugin 是否启用。
   */
  enabled: boolean;
  /**
   * Plugin 当前是否可用。
   */
  available: boolean;
  /**
   * 不可用原因列表。
   */
  reasons: string[];
  /**
   * 缺失 Asset 列表（可选）。
   */
  missingAssets?: string[];
}

/**
 * Plugin 调用端口。
 */
export interface PluginPort {
  /**
   * 列出全部已注册 Plugin。
   */
  list(): PluginRuntimeView[];
  /**
   * 检查指定 Plugin 可用性。
   */
  availability(pluginName: string): Promise<PluginAvailability>;
  /**
   * 运行指定 Plugin Action。
   */
  runAction(params: {
    /**
     * Plugin 名称。
     */
    plugin: string;
    /**
     * Action 名称。
     */
    action: string;
    /**
     * Action Payload（可选）。
     */
    payload?: JsonValue;
  }): Promise<PluginActionResult<JsonValue>>;
}

/**
 * Plugin 运行时对象。
 */
export interface PluginRuntime extends AssetRuntimeLike {
  /**
   * 统一日志器。
   */
  logger: Logger;
  /**
   * 当前配置对象。
   */
  config: ShipConfig;
  /**
   * Service 调用端口。
   */
  services: PluginServiceInvokePort;
  /**
   * Capability 调用端口。
   */
  capabilities: CapabilityPort;
  /**
   * Asset 调用端口。
   */
  assets: AssetPort;
  /**
   * Plugin 调用端口。
   */
  plugins: PluginPort;
  /**
   * 运行时上下文对象（插件可按需窄化）。
   */
  context: unknown;
}

/**
 * Plugin 配置定义。
 */
export interface PluginConfigDefinition<T extends StructuredConfig = StructuredConfig> {
  /**
   * Plugin 稳定名称。
   */
  plugin: string;
  /**
   * 配置作用域。
   */
  scope: "global" | "project";
  /**
   * 默认配置值。
   */
  defaultValue: T;
}

/**
 * Plugin 依赖定义。
 */
export interface PluginRequirements {
  /**
   * 依赖的 Asset 名称列表。
   */
  assets?: string[];
}

/**
 * Plugin Capability 处理器。
 */
export type PluginCapability<
  TInput extends JsonValue = JsonValue,
  TOutput extends JsonValue = JsonValue,
> = (params: {
  /**
   * 当前插件运行时。
   */
  runtime: PluginRuntime;
  /**
   * 输入 payload。
   */
  payload: TInput;
  /**
   * 当前插件名称。
   */
  plugin: string;
}) => Promise<TOutput> | TOutput;

/**
 * Plugin Capability 映射。
 */
export type PluginCapabilities = {
  [capabilityName: string]: PluginCapability<JsonValue, JsonValue>;
};

/**
 * Plugin 事件型 Hook。
 */
export type PluginEventHook<T = JsonValue> = (params: {
  /**
   * 当前插件运行时。
   */
  runtime: PluginRuntime;
  /**
   * 当前值。
   */
  value: T;
  /**
   * 当前插件名称。
   */
  plugin: string;
}) => Promise<void> | void;

/**
 * Plugin 变换型 Hook。
 */
export type PluginTransformHook<T = JsonValue> = (params: {
  /**
   * 当前插件运行时。
   */
  runtime: PluginRuntime;
  /**
   * 当前值。
   */
  value: T;
  /**
   * 当前插件名称。
   */
  plugin: string;
}) => Promise<T> | T;

/**
 * Plugin Hook 定义集合。
 */
export interface PluginHooks {
  /**
   * 事件型 Hook 映射。
   */
  on?: Record<string, PluginEventHook<JsonValue>[]>;
  /**
   * 变换型 Hook 映射。
   */
  transform?: Record<string, PluginTransformHook<JsonValue>[]>;
}

/**
 * Plugin Action 执行结果。
 */
export interface PluginActionResult<R extends JsonValue = JsonValue> {
  /**
   * Action 是否成功。
   */
  success: boolean;
  /**
   * 返回数据（可选）。
   */
  data?: R;
  /**
   * 错误信息（可选）。
   */
  error?: string;
  /**
   * 人类可读消息（可选）。
   */
  message?: string;
}

/**
 * Plugin Action 命令输入。
 */
export interface PluginActionCommandInput {
  /**
   * 位置参数列表。
   */
  args: string[];
  /**
   * 选项参数对象。
   */
  opts: Record<string, JsonValue>;
}

/**
 * Plugin Action CLI 定义。
 */
export interface PluginActionCommand<P extends JsonValue = JsonValue> {
  /**
   * 命令说明。
   */
  description: string;
  /**
   * 额外 commander 配置（可选）。
   */
  configure?: (command: Command) => void;
  /**
   * 将 CLI 输入映射为 payload。
   */
  mapInput: (input: PluginActionCommandInput) => P | Promise<P>;
}

/**
 * Plugin Action HTTP 定义。
 */
export interface PluginActionApi<P extends JsonValue = JsonValue> {
  /**
   * HTTP 方法。
   */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /**
   * HTTP 路径。
   */
  path?: string;
  /**
   * 将 HTTP 输入映射为 payload（可选）。
   */
  mapInput?: (ctx: HonoContext) => P | Promise<P>;
}

/**
 * Plugin Action 定义。
 */
export interface PluginAction<
  P extends JsonValue = JsonValue,
  R extends JsonValue = JsonValue,
> {
  /**
   * CLI 定义（可选）。
   */
  command?: PluginActionCommand<P>;
  /**
   * HTTP 定义（可选）。
   */
  api?: PluginActionApi<P>;
  /**
   * Action 执行器。
   */
  execute: (params: {
    /**
     * 当前插件运行时。
     */
    runtime: PluginRuntime;
    /**
     * 输入 payload。
     */
    payload: P;
    /**
     * 当前插件名称。
     */
    pluginName: string;
    /**
     * 当前 Action 名称。
     */
    actionName: string;
  }) => Promise<PluginActionResult<R>> | PluginActionResult<R>;
}

/**
 * Plugin Action 集合。
 */
export type PluginActions = {
  [actionName: string]: PluginAction<JsonValue, JsonValue>;
};

/**
 * Plugin 定义。
 */
export interface Plugin {
  /**
   * Plugin 稳定名称。
   */
  name: string;
  /**
   * Plugin 配置定义（可选）。
   */
  config?: PluginConfigDefinition<StructuredConfig>;
  /**
   * Plugin 显式 Action 集合（可选）。
   */
  actions?: PluginActions;
  /**
   * Plugin Hook 集合（可选）。
   */
  hooks?: PluginHooks;
  /**
   * Plugin Capability 集合（可选）。
   */
  capabilities?: PluginCapabilities;
  /**
   * Plugin system 文本构建器（可选）。
   */
  system?: (runtime: PluginRuntime) => string | Promise<string>;
  /**
   * Plugin 可用性检查器（可选）。
   */
  availability?: (
    runtime: PluginRuntime,
  ) => Promise<PluginAvailability> | PluginAvailability;
  /**
   * Plugin 依赖定义（可选）。
   */
  requirements?: PluginRequirements;
}
