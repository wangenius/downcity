/**
 * BaseService：service 类实现的统一基类。
 *
 * 关键点（中文）
 * - agent 会持有 per-agent 的 service instance，而不再直接依赖全局 service 单例对象。
 * - 各 service 的长期状态应归属于实例本身，而不是模块级单例。
 */

import type { AgentState } from "@/types/AgentState.js";
import type {
  Service,
  ServiceActions,
  ServiceLifecycle,
} from "@/types/Service.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { ServiceStateRecord } from "@/types/ServiceState.js";

/**
 * BaseService 抽象基类。
 *
 * 关键点（中文）
 * - 保留统一 `Service` 契约。
 * - 为实例字段状态（cronEngine / queueWorker / watchers / shellSessions）预留宿主引用。
 */
export abstract class BaseService implements Service {
  /**
   * 当前实例持有的通用 service 状态记录。
   *
   * 关键点（中文）
   * - 通用 lifecycle 状态直接归属于 service 实例。
   * - `ServiceStateController` 只负责读写，不再维护全局状态表。
   */
  public readonly serviceStateRecord: ServiceStateRecord = {
    state: "stopped",
    updatedAt: Date.now(),
    chain: Promise.resolve(),
  };

  /**
   * 当前 service 所属的 agent 宿主。
   *
   * 关键点（中文）
   * - 允许为空，仅用于静态装配与无宿主测试场景。
   * - 真正运行中的 service 实例应始终绑定一个 agent。
   */
  protected readonly agent: AgentState | null;

  constructor(agent: AgentState | null) {
    this.agent = agent;
  }

  /**
   * 当前 service 名称。
   */
  abstract readonly name: string;

  /**
   * 当前 service 的 action 定义表。
   */
  abstract readonly actions: ServiceActions;

  /**
   * 可选的 service 级 system 文本提供器。
   */
  system?(context: ExecutionContext): string | Promise<string>;

  /**
   * 可选的 service 生命周期定义。
   */
  lifecycle?: ServiceLifecycle;

  /**
   * 读取绑定的 agent 宿主。
   *
   * 关键点（中文）
   * - 仅供后续真正 class service 在实例方法中读取宿主能力。
   * - 未绑定 agent 时直接 fail-fast，避免静默读取 undefined。
   */
  protected requireAgent(): AgentState {
    if (this.agent) return this.agent;
    throw new Error(
      `Service "${this.name}" is not bound to an agent instance.`,
    );
  }
}
