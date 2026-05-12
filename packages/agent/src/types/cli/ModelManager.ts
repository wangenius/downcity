/**
 * `city model` 交互式 manager 类型。
 *
 * 关键点（中文）
 * - 统一描述交互式模型管理器中的菜单动作与摘要视图。
 * - 避免 CLI 模块内部散落匿名对象类型，保持命令实现可维护。
 */

/**
 * `city model` 根菜单动作。
 */
export type ModelManagerRootAction =
  /**
   * 进入 provider 管理视图。
   */
  | "providers"
  /**
   * 进入 model 管理视图。
   */
  | "models"
  /**
   * 直接进入创建流程。
   */
  | "create"
  /**
   * 退出交互式管理器。
   */
  | "exit";

/**
 * provider 详情视图可执行动作。
 */
export type ModelManagerProviderAction =
  /**
   * 查看 provider 详情。
   */
  | "details"
  /**
   * 测试 provider，并尝试发现远端模型。
   */
  | "discover"
  /**
   * 返回上一级菜单。
   */
  | "back";

/**
 * model 详情视图可执行动作。
 */
export type ModelManagerModelAction =
  /**
   * 查看 model 详情。
   */
  | "details"
  /**
   * 切换暂停状态。
   */
  | "togglePause"
  /**
   * 真实调用一次 model 做连通性测试。
   */
  | "test"
  /**
   * 绑定到某个 agent 项目的 `execution.modelId`。
   */
  | "use"
  /**
   * 返回上一级菜单。
   */
  | "back";

/**
 * provider 列表中的摘要信息。
 */
export interface ModelManagerProviderSummary {
  /**
   * provider 唯一 ID。
   */
  id: string;

  /**
   * provider 类型。
   */
  type: string;

  /**
   * provider 配置的 baseUrl。
   *
   * 说明（中文）
   * - 可能为空，表示使用 provider 默认地址。
   */
  baseUrl?: string;

  /**
   * 当前引用该 provider 的本地 model 数量。
   */
  modelCount: number;
}

/**
 * model 列表中的摘要信息。
 */
export interface ModelManagerModelSummary {
  /**
   * model 唯一 ID。
   */
  id: string;

  /**
   * model 绑定的 provider ID。
   */
  providerId: string;

  /**
   * 上游真实模型名。
   */
  name: string;

  /**
   * 当前 model 是否已暂停。
   */
  isPaused: boolean;

  /**
   * model 的温度参数。
   *
   * 说明（中文）
   * - 未配置时为空。
   */
  temperature?: number;

  /**
   * model 的最大 token 参数。
   *
   * 说明（中文）
   * - 未配置时为空。
   */
  maxTokens?: number;
}
