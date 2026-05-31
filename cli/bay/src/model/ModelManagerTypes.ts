/**
 * `bay model` 交互式 manager 类型。
 */

export type ModelManagerRootAction =
  /**
   * 进入 provider 管理列表。
   */
  | "providers"
  /**
   * 进入 model 管理列表。
   */
  | "models"
  /**
   * 跳转到创建流程。
   */
  | "create"
  /**
   * 退出 manager。
   */
  | "exit";

export type ModelManagerProviderAction =
  /**
   * 查看 provider 详情。
   */
  | "details"
  /**
   * 编辑 provider 配置。
   */
  | "edit"
  /**
   * 测试 provider 并导入发现到的模型。
   */
  | "discover"
  /**
   * 删除 provider。
   */
  | "remove"
  /**
   * 返回上一层。
   */
  | "back";

export type ModelManagerModelAction =
  /**
   * 查看 model 详情。
   */
  | "details"
  /**
   * 编辑 model 配置。
   */
  | "edit"
  /**
   * 切换暂停状态。
   */
  | "togglePause"
  /**
   * 测试 model 可调用性。
   */
  | "test"
  /**
   * 绑定到项目。
   */
  | "use"
  /**
   * 删除 model。
   */
  | "remove"
  /**
   * 返回上一层。
   */
  | "back";

export interface ModelManagerProviderSummary {
  /**
   * provider 在全局模型池中的唯一 ID。
   */
  id: string;
  /**
   * provider 类型，例如 `openai`、`anthropic`。
   */
  type: string;
  /**
   * provider 自定义 base URL；为空表示使用 SDK 默认地址。
   */
  baseUrl?: string;
  /**
   * 当前引用该 provider 的模型数量。
   */
  modelCount: number;
}

export interface ModelManagerModelSummary {
  /**
   * model 在全局模型池中的唯一 ID。
   */
  id: string;
  /**
   * 当前 model 绑定的 provider ID。
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
   * 可选的 temperature 覆写；为空表示使用上游默认值。
   */
  temperature?: number;
  /**
   * 可选的 maxTokens 覆写；为空表示使用上游默认值。
   */
  maxTokens?: number;
}
