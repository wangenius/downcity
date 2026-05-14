/**
 * `city agent` 交互式 manager 类型。
 *
 * 关键点（中文）
 * - 统一描述交互式 agent 管理器中的菜单动作与摘要视图。
 * - CLI 实现只引用这些显式类型，避免在命令模块中散落匿名对象结构。
 */

/**
 * `city agent` 根菜单动作。
 */
export type AgentManagerRootAction =
  /**
   * 查看 city registry 中登记的 agent。
   */
  | "list"
  /**
   * 创建或初始化一个 agent 项目。
   */
  | "create"
  /**
   * 启动一个 agent daemon。
   */
  | "start"
  /**
   * 选择一个已登记 agent 并进入管理视图。
   */
  | "manage"
  /**
   * 退出交互式管理器。
   */
  | "exit";

/**
 * 单个 agent 详情视图可执行动作。
 */
export type AgentManagerAgentAction =
  /**
   * 查看 agent daemon 状态。
   */
  | "status"
  /**
   * 启动当前 agent daemon。
   */
  | "start"
  /**
   * 停止当前 agent daemon。
   */
  | "stop"
  /**
   * 重启当前 agent daemon。
   */
  | "restart"
  /**
   * 在终端里与当前 agent 对话。
   */
  | "chat"
  /**
   * 配置当前 agent 的展示名称。
   */
  | "configureName"
  /**
   * 配置当前 agent 的执行模型绑定。
   */
  | "configureModel"
  /**
   * 将当前 agent 连接到 city 级 chat channel account。
   */
  | "connectChannels"
  /**
   * 返回上一级菜单。
   */
  | "back";

/**
 * agent 列表中的摘要信息。
 */
export interface AgentManagerAgentSummary {
  /**
   * agent 展示名称。
   *
   * 说明（中文）
   * - 优先来自项目配置中的 agent 名称。
   * - 当配置不可读时由项目目录名兜底。
   */
  name: string;

  /**
   * agent 项目的绝对路径。
   */
  projectRoot: string;

  /**
   * agent 当前运行状态。
   *
   * 说明（中文）
   * - `running` 表示 daemon 仍然存活。
   * - `stopped` 表示 registry 中有记录但当前未运行。
   */
  status: "running" | "stopped";

  /**
   * 当前 agent 配置中的执行模型 ID。
   *
   * 说明（中文）
   * - 来自 `downcity.json.execution.modelId`。
   * - 配置缺失或不可读时为空。
   */
  modelId?: string;

  /**
   * 当前 agent 关联的 chat channel 摘要。
   *
   * 说明（中文）
   * - 来源于 `downcity.json.services.chat.channels`。
   * - 只表达 agent 与 city channel account 的关联，不承载账号密钥配置。
   */
  channels: string[];
}
