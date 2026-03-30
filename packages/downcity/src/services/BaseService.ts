/**
 * BaseService：service 类化改造的统一基类。
 *
 * 关键点（中文）
 * - 第一阶段先允许继续复用 legacy service definition。
 * - agent 会持有 per-agent 的 service instance，而不再直接依赖全局 service object。
 * - 后续 chat/task/memory/shell 可以逐步从 legacy adapter 迁移为真正的 class service。
 */

import type { AgentState } from "@/types/AgentState.js";
import type {
  Service,
  ServiceActions,
  ServiceLifecycle,
} from "@/types/Service.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";

/**
 * BaseService 抽象基类。
 *
 * 关键点（中文）
 * - 保留现有 `Service` 契约，降低第一阶段迁移成本。
 * - 同时为后续实例字段状态（cronEngine / queueWorker / watchers / shellSessions）预留宿主引用。
 */
export abstract class BaseService implements Service {
  /**
   * 当前 service 所属的 agent 宿主。
   *
   * 关键点（中文）
   * - 第一阶段允许为空，仅用于 legacy adapter 的非运行态场景。
   * - 真正 class 化后，service 实例应始终绑定一个 agent。
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
      `Service "${this.name}" is not bound to an agent runtime instance.`,
    );
  }
}

/**
 * LegacyServiceAdapter：把现有对象式 service 包成 class instance。
 *
 * 关键点（中文）
 * - 这是第一阶段过渡层。
 * - 它不改变 action/lifecycle/system 的具体实现，只改变“实例归属”。
 */
export class LegacyServiceAdapter extends BaseService {
  /**
   * 当前 service 名称。
   */
  readonly name: string;

  /**
   * 当前 service 的 action 定义表。
   */
  readonly actions: ServiceActions;

  /**
   * 当前 service 的 system 文本提供器。
   */
  readonly system?: Service["system"];

  /**
   * 当前 service 的生命周期定义。
   */
  readonly lifecycle?: ServiceLifecycle;

  constructor(params: {
    /**
     * 当前 service 所属的 agent 宿主。
     */
    agent: AgentState | null;
    /**
     * 现有 legacy service definition。
     */
    definition: Service;
  }) {
    super(params.agent);
    this.name = params.definition.name;
    this.actions = params.definition.actions;
    this.system = params.definition.system;
    this.lifecycle = params.definition.lifecycle;
  }
}
