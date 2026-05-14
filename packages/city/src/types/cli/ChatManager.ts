/**
 * `city chat` 交互式 manager 类型。
 *
 * 关键点（中文）
 * - `city chat` 裸命令用于管理 chat service 与 city 级 channel accounts。
 * - 这里集中定义菜单动作，避免 CLI 实现里散落匿名字符串。
 */

/**
 * `city chat` 根菜单动作。
 */
export type ChatManagerRootAction =
  /**
   * 查看当前项目 chat service 状态。
   */
  | "status"
  /**
   * 启动当前项目 chat service。
   */
  | "start"
  /**
   * 停止当前项目 chat service。
   */
  | "stop"
  /**
   * 重启当前项目 chat service。
   */
  | "restart"
  /**
   * 管理 city 全局 chat channel account。
   */
  | "configureChannels"
  /**
   * 退出交互式管理器。
   */
  | "exit";

/**
 * Chat channel account 管理菜单动作。
 */
export type ChatChannelAccountAction =
  /**
   * 查看已配置账号。
   */
  | "list"
  /**
   * 新增账号。
   */
  | "add"
  /**
   * 编辑已有账号。
   */
  | "edit"
  /**
   * 删除已有账号。
   */
  | "remove"
  /**
   * 配置 city 全局 chat authorization。
   */
  | "configureAuthorization"
  /**
   * 返回上一级菜单。
   */
  | "back";
