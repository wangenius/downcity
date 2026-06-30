/**
 * BasePlugin：统一 plugin 类基座。
 *
 * 关键点（中文）
 * - 主动运行型能力与被动扩展型能力统一收敛到 plugin 概念。
 * - plugin 的长期状态归属于实例本身，而不是模块级单例。
 * - Agent 注册 plugin 时自动启动 lifecycle；卸载时自动停止 lifecycle。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type {
  Plugin,
  PluginActions,
  PluginAvailability,
  PluginCommandContext,
  PluginConfigDefinition,
  PluginHooks,
  PluginHttpDefinition,
  PluginLifecycle,
  PluginResolves,
  PluginSetupDefinition,
  PluginUsageDefinition,
} from "@/plugin/types/Plugin.js";
import type { PluginRuntimeRecord } from "@/types/plugin/PluginState.js";
import type { StructuredConfig } from "@/types/runtime/agent/AgentContext.js";

/**
 * BasePlugin 抽象基类。
 */
export abstract class BasePlugin implements Plugin {
  /**
   * 当前实例持有的 plugin 注册状态记录。
   */
  public readonly pluginStateRecord: PluginRuntimeRecord = {
    plugin: this,
    state: "ready",
    registered_at: Date.now(),
    updated_at: Date.now(),
    chain: Promise.resolve(),
    lifecycle_started: false,
  };

  /**
   * 当前 plugin 名称。
   */
  abstract readonly name: string;

  /**
   * 插件标题。
   */
  readonly title: string = "";

  /**
   * 插件说明。
   */
  readonly description: string = "";

  /**
   * 插件配置定义。
   */
  readonly config?: PluginConfigDefinition<StructuredConfig>;

  /**
   * 插件 setup 协议。
   */
  readonly setup?: PluginSetupDefinition;

  /**
   * 插件 usage 协议。
   */
  readonly usage?: PluginUsageDefinition;

  /**
   * 显式 action 集合。
   */
  readonly actions: PluginActions = {};

  /**
   * pipeline / guard / effect 扩展点。
   */
  readonly hooks?: PluginHooks;

  /**
   * resolve 扩展点。
   */
  readonly resolves?: PluginResolves;

  /**
   * HTTP 路由扩展。
   */
  readonly http?: PluginHttpDefinition;

  /**
   * 生命周期兼容层。
   */
  lifecycle?: PluginLifecycle;

  /**
   * Plugin 可用性检查。
   */
  availability?(
    context: PluginCommandContext | AgentContext,
  ): Promise<PluginAvailability> | PluginAvailability;

  /**
   * Plugin system 文本提供器。
   */
  system?(context: AgentContext): Promise<string> | string;

}
