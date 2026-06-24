/**
 * Plugin runtime 类型。
 *
 * 关键点（中文）
 * - 这里描述 Agent runtime 如何查看、调用、检查 plugin。
 * - setup/usage UI 协议与 action 输入适配不放在这里。
 */

import type {
  AgentContext,
  StructuredConfig,
} from "@/types/runtime/agent/AgentContext.js";
import type { JsonValue } from "@/types/common/Json.js";
import type { PluginActionResult } from "@/types/plugin/PluginAction.js";
import type { PluginActionExample } from "@/types/plugin/PluginAction.js";

/**
 * Plugin 概览视图。
 */
export interface PluginView {
  /** Plugin 稳定名称。 */
  name: string;
  /** Plugin 面向用户界面的展示标题。 */
  title: string;
  /** Plugin 面向人类的用途说明。 */
  description: string;
  /** Plugin Action 名称列表。 */
  actions: string[];
  /** Plugin pipeline 点名称列表。 */
  pipelines: string[];
  /** Plugin guard 点名称列表。 */
  guards: string[];
  /** Plugin effect 点名称列表。 */
  effects: string[];
  /** Plugin resolve 点名称列表。 */
  resolves: string[];
  /** 是否声明了 system 注入。 */
  hasSystem: boolean;
  /** 是否声明了 availability 检查。 */
  hasAvailability: boolean;
}

/**
 * Plugin Action 读取视图。
 */
export interface PluginActionReadView {
  /** Action 名称。 */
  name: string;
  /** Action 用途说明。 */
  description: string;
  /** 是否声明输入 schema。 */
  has_input_schema: boolean;
  /** JSON Schema 形式的输入说明。 */
  input_schema?: JsonValue;
  /** Action 调用示例。 */
  examples?: PluginActionExample[];
  /** disabled 状态下是否仍允许执行。 */
  allow_when_disabled: boolean;
  /** 是否声明 CLI command。 */
  has_command: boolean;
  /** 是否声明 HTTP API。 */
  has_api: boolean;
}

/**
 * Plugin 读取视图。
 */
export interface PluginReadView {
  /** Plugin 稳定名称。 */
  name: string;
  /** Plugin 展示标题。 */
  title: string;
  /** Plugin 用途说明。 */
  description: string;
  /** Action 列表或指定 action。 */
  actions: PluginActionReadView[];
}

/**
 * Plugin 可用性结果。
 */
export interface PluginAvailability {
  /** Plugin 是否启用。 */
  enabled: boolean;
  /** Plugin 当前是否可用。 */
  available: boolean;
  /** 不可用原因列表。 */
  reasons: string[];
}

/**
 * 当前 Agent 可用的 plugin 调用面。
 */
export interface AgentPlugins {
  /** 列出全部已注册 plugin。 */
  list(): PluginView[];
  /** 读取 plugin / action metadata。 */
  read(params: {
    /** Plugin 名称。 */
    plugin?: string;
    /** Action 名称。 */
    action?: string;
  }): PluginReadView | { plugins: PluginView[] };
  /** 检查指定 plugin 可用性。 */
  availability(pluginName: string): Promise<PluginAvailability>;
  /** 运行指定 plugin action。 */
  runAction(params: {
    /** Plugin 名称。 */
    plugin: string;
    /** Action 名称。 */
    action: string;
    /** Action Payload（可选）。 */
    payload?: JsonValue;
  }): Promise<PluginActionResult<JsonValue>>;
  /** 运行 pipeline 点，按顺序链式变换值。 */
  pipeline<T = JsonValue>(pointName: string, value: T): Promise<T>;
  /** 运行 guard 点；任一插件抛错即终止。 */
  guard<T = JsonValue>(pointName: string, value: T): Promise<void>;
  /** 运行 effect 点；只执行副作用。 */
  effect<T = JsonValue>(pointName: string, value: T): Promise<void>;
  /** 运行 resolve 点；要求存在且仅存在一个处理器。 */
  resolve<TInput = JsonValue, TOutput = JsonValue>(
    pointName: string,
    value: TInput,
  ): Promise<TOutput>;
}

/**
 * Plugin 配置定义。
 */
export interface PluginConfigDefinition<T extends StructuredConfig = StructuredConfig> {
  /** Plugin 稳定名称。 */
  plugin: string;
  /** 配置作用域。 */
  scope: "global" | "project";
  /** 默认配置值。 */
  defaultValue: T;
}

/**
 * Plugin pipeline 处理器。
 */
export type PluginPipelineHook<
  TValue extends JsonValue = JsonValue,
> = (params: {
  /** 当前执行上下文。 */
  context: AgentContext;
  /** 当前值。 */
  value: TValue;
  /** 当前插件名称。 */
  plugin: string;
}) => Promise<TValue> | TValue;

/**
 * Plugin guard 处理器。
 *
 * 关键点（中文）
 * - 不返回结果；若需阻断流程，直接抛错。
 */
export type PluginGuardHook<TValue extends JsonValue = JsonValue> = (params: {
  /** 当前执行上下文。 */
  context: AgentContext;
  /** 当前值。 */
  value: TValue;
  /** 当前插件名称。 */
  plugin: string;
}) => Promise<void> | void;

/**
 * Plugin effect 处理器。
 */
export type PluginEffectHook<TValue extends JsonValue = JsonValue> = (params: {
  /** 当前执行上下文。 */
  context: AgentContext;
  /** 当前值。 */
  value: TValue;
  /** 当前插件名称。 */
  plugin: string;
}) => Promise<void> | void;

/**
 * Plugin resolve 处理器。
 */
export type PluginResolveHook<
  TInput extends JsonValue = JsonValue,
  TOutput extends JsonValue = JsonValue,
> = (params: {
  /** 当前执行上下文。 */
  context: AgentContext;
  /** 当前输入值。 */
  value: TInput;
  /** 当前插件名称。 */
  plugin: string;
}) => Promise<TOutput> | TOutput;

/**
 * Plugin Hook 定义集合。
 */
export interface PluginHooks {
  /** pipeline 点映射。 */
  pipeline?: Record<string, PluginPipelineHook<JsonValue>[]>;
  /** guard 点映射。 */
  guard?: Record<string, PluginGuardHook<JsonValue>[]>;
  /** effect 点映射。 */
  effect?: Record<string, PluginEffectHook<JsonValue>[]>;
}

/**
 * Plugin resolve 点集合。
 */
export type PluginResolves = {
  [pointName: string]: PluginResolveHook<JsonValue, JsonValue>;
};
