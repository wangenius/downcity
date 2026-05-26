/**
 * BasePlugin：统一 plugin 类基座。
 *
 * 关键点（中文）
 * - 主动运行型能力与被动扩展型能力统一收敛到 plugin 概念。
 * - plugin 的长期状态归属于实例本身，而不是模块级单例。
 * - 旧生命周期模型暂时通过 `lifecycle` 兼容，后续可逐步收敛到 `start/stop/command`。
 */

import type { AgentContext } from "@/core/AgentContextTypes.js";
import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
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
  PluginStateRecord,
  PluginUsageDefinition,
} from "@/plugin/types/Plugin.js";
import type { StructuredConfig } from "@/core/AgentContextTypes.js";

/**
 * BasePlugin 抽象基类。
 */
export abstract class BasePlugin implements Plugin {
  /**
   * 当前实例持有的通用 plugin 运行状态记录。
   */
  public readonly pluginStateRecord: PluginStateRecord = {
    state: "stopped",
    updatedAt: Date.now(),
    chain: Promise.resolve(),
  };

  /**
   * 当前 plugin 所属的 agent 宿主。
   */
  protected agent: AgentRuntime | null;

  constructor(agent: AgentRuntime | null = null) {
    this.agent = agent;
  }

  /**
   * 当前 plugin 名称。
   */
  abstract readonly name: string;

  /**
   * 插件标题。
   */
  readonly title = "";

  /**
   * 插件说明。
   */
  readonly description = "";

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

  /**
   * 绑定当前 plugin 所属的 agent 宿主。
   */
  bindAgent(agent: AgentRuntime | null): this {
    this.agent = agent;
    return this;
  }

  /**
   * 读取绑定的 agent 宿主。
   */
  protected requireAgent(): AgentRuntime {
    if (this.agent) return this.agent;
    throw new Error(
      `Plugin "${this.name}" is not bound to an agent instance.`,
    );
  }
}
