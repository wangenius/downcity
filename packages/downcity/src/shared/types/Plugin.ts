/**
 * Plugin 类型定义。
 *
 * 关键点（中文）
 * - Plugin 现在同时承载两类定义：CLI actions 与 runtime hooks。
 * - CLI action 面向显式命令调用；hooks / resolves / system 面向 agent 运行时 plugin。
 * - Plugin 的依赖实现应内聚在插件内部，而不是挂成公共执行上下文能力。
 */

import type { Command } from "commander";
import type { Context as HonoContext } from "hono";
import type {
  AgentAuthRuntime,
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "@/shared/types/AgentHost.js";
import type {
  ExecutionContext,
  StructuredConfig,
} from "@/shared/types/ExecutionContext.js";
import type { Logger } from "@shared/utils/logger/Logger.js";
import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";

/**
 * Plugin 命令执行上下文。
 *
 * 关键点（中文）
 * - 这里表达的是“CLI 命令执行 plugin 时真正需要的最小上下文”。
 * - plugin 命令不应依赖 session、service invoke、agent runtime 等长期宿主对象。
 * - agent runtime 在需要复用 action 时，直接传入自身更完整的 ExecutionContext 即可。
 */
export interface PluginCommandContext {
  /**
   * 当前命令工作目录。
   */
  cwd: string;
  /**
   * 当前项目根目录。
   */
  rootPath: string;
  /**
   * 当前统一日志器。
   */
  logger: Logger;
  /**
   * 当前解析后的项目配置。
   */
  config: DowncityConfig;
  /**
   * 当前项目环境变量快照。
   */
  env: Record<string, string>;
  /**
   * 当前 console 级全局环境变量快照。
   */
  globalEnv: Record<string, string>;
  /**
   * 当前可见的路径能力集合。
   */
  paths: AgentPathRuntime;
  /**
   * 当前可见的认证能力集合。
   */
  auth: AgentAuthRuntime;
  /**
   * 当前可见的 plugin 配置持久化能力集合。
   */
  pluginConfig: AgentPluginConfigRuntime;
}

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
 * Plugin 概览视图。
 */
export interface PluginView {
  /**
   * Plugin 稳定名称。
   */
  name: string;
  /**
   * Plugin 面向用户界面的展示标题。
   */
  title: string;
  /**
   * Plugin 面向人类的用途说明。
   */
  description: string;
  /**
   * Plugin Action 名称列表。
   */
  actions: string[];
  /**
   * Plugin pipeline 点名称列表。
   */
  pipelines: string[];
  /**
   * Plugin guard 点名称列表。
   */
  guards: string[];
  /**
   * Plugin effect 点名称列表。
   */
  effects: string[];
  /**
   * Plugin resolve 点名称列表。
   */
  resolves: string[];
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
}

/**
 * Plugin 调用端口。
 */
export interface PluginPort {
  /**
   * 列出全部已注册 plugin。
   */
  list(): PluginView[];
  /**
   * 检查指定 plugin 可用性。
   */
  availability(pluginName: string): Promise<PluginAvailability>;
  /**
   * 运行指定 plugin action。
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
  /**
   * 运行 pipeline 点，按顺序链式变换值。
   */
  pipeline<T = JsonValue>(pointName: string, value: T): Promise<T>;
  /**
   * 运行 guard 点；任一插件抛错即终止。
   */
  guard<T = JsonValue>(pointName: string, value: T): Promise<void>;
  /**
   * 运行 effect 点；只执行副作用。
   */
  effect<T = JsonValue>(pointName: string, value: T): Promise<void>;
  /**
   * 运行 resolve 点；要求存在且仅存在一个处理器。
   */
  resolve<TInput = JsonValue, TOutput = JsonValue>(
    pointName: string,
    value: TInput,
  ): Promise<TOutput>;
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
 * Plugin pipeline 处理器。
 */
export type PluginPipelineHook<
  TValue extends JsonValue = JsonValue,
> = (params: {
  /**
   * 当前执行上下文。
   */
  context: ExecutionContext;
  /**
   * 当前值。
   */
  value: TValue;
  /**
   * 当前插件名称。
   */
  plugin: string;
}) => Promise<TValue> | TValue;

/**
 * Plugin guard 处理器。
 *
 * 关键点（中文）
 * - 不返回结果；若需阻断流程，直接抛错。
 */
export type PluginGuardHook<TValue extends JsonValue = JsonValue> = (params: {
  context: ExecutionContext;
  value: TValue;
  plugin: string;
}) => Promise<void> | void;

/**
 * Plugin effect 处理器。
 */
export type PluginEffectHook<TValue extends JsonValue = JsonValue> = (params: {
  context: ExecutionContext;
  value: TValue;
  plugin: string;
}) => Promise<void> | void;

/**
 * Plugin resolve 处理器。
 */
export type PluginResolveHook<
  TInput extends JsonValue = JsonValue,
  TOutput extends JsonValue = JsonValue,
> = (params: {
  context: ExecutionContext;
  value: TInput;
  plugin: string;
}) => Promise<TOutput> | TOutput;

/**
 * Plugin Hook 定义集合。
 */
export interface PluginHooks {
  /**
   * pipeline 点映射。
   */
  pipeline?: Record<string, PluginPipelineHook<JsonValue>[]>;
  /**
   * guard 点映射。
   */
  guard?: Record<string, PluginGuardHook<JsonValue>[]>;
  /**
   * effect 点映射。
   */
  effect?: Record<string, PluginEffectHook<JsonValue>[]>;
}

/**
 * Plugin resolve 点集合。
 */
export type PluginResolves = {
  [pointName: string]: PluginResolveHook<JsonValue, JsonValue>;
};

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
   * disabled 状态下是否仍允许执行。
   *
   * 说明（中文）
   * - 用于 `on` / `status` / `models` / `configure` / `install` 这类 setup 相关 action。
   * - 默认 false，避免 disabled plugin 绕过 registry 保护执行普通业务 action。
   */
  allowWhenDisabled?: boolean;
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
     * 当前执行上下文。
     */
    context: PluginCommandContext;
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
 * Plugin setup 字段选项。
 */
export interface PluginSetupFieldOption {
  /**
   * 选项展示标签。
   */
  label: string;
  /**
   * 选项实际值。
   */
  value: string;
  /**
   * 选项补充说明（可选）。
   */
  hint?: string;
}

/**
 * Plugin setup 字段定义。
 */
export interface PluginSetupField {
  /**
   * 字段稳定键。
   */
  key: string;
  /**
   * 字段展示标签。
   */
  label: string;
  /**
   * 字段类型。
   *
   * 说明（中文）
   * - 当前阶段只允许 `select` 与 `checkbox`，避免退回到大量自由输入。
   */
  type: "select" | "checkbox";
  /**
   * 是否必填。
   */
  required?: boolean;
  /**
   * 静态选项列表（可选）。
   */
  options?: PluginSetupFieldOption[];
  /**
   * 动态选项来源 action（可选）。
   *
   * 说明（中文）
   * - 若存在，则 Console 打开 setup 弹窗时会先调用该 action 拉取下拉选项。
   */
  sourceAction?: string;
}

/**
 * Plugin setup 定义。
 */
export interface PluginSetupDefinition {
  /**
   * setup 模式。
   *
   * 说明（中文）
   * - `install`：只执行依赖安装。
   * - `configure`：只写入配置。
   * - `install-configure`：安装与配置一体化。
   */
  mode: "install" | "configure" | "install-configure";
  /**
   * setup 面板标题。
   */
  title: string;
  /**
   * setup 面板说明（可选）。
   */
  description?: string;
  /**
   * setup 字段列表。
   */
  fields: PluginSetupField[];
  /**
   * 主动作 action 名称。
   */
  primaryAction: string;
  /**
   * 状态同步 action 名称（可选）。
   */
  statusAction?: string;
}

/**
 * Plugin 定义。
 */
export interface Plugin {
  /**
   * Plugin 稳定名称。
   */
  name: string;
  /**
   * Plugin 面向用户界面的展示标题。
   */
  title: string;
  /**
   * Plugin 面向人类的用途说明。
   */
  description: string;
  /**
   * Plugin 配置定义（可选）。
   */
  config?: PluginConfigDefinition<StructuredConfig>;
  /**
   * Plugin 显式 Action 集合（可选）。
   */
  actions?: PluginActions;
  /**
   * Plugin setup 定义（可选）。
   *
   * 说明（中文）
   * - 这是 Console 面向用户的安装/配置协议。
   * - plugin 内部仍可复用 asset/helper，但 UI 只读取这层抽象。
   */
  setup?: PluginSetupDefinition;
  /**
   * Plugin Hook 集合（可选）。
   */
  hooks?: PluginHooks;
  /**
   * Plugin resolve 点集合（可选）。
   */
  resolves?: PluginResolves;
  /**
   * Plugin system 文本构建器（可选）。
   */
  system?: (context: ExecutionContext) => string | Promise<string>;
  /**
   * Plugin 可用性检查器（可选）。
   */
  availability?: (
    context: PluginCommandContext,
  ) => Promise<PluginAvailability> | PluginAvailability;
}
