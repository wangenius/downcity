/**
 * `city agent chat` CLI 类型。
 *
 * 关键点（中文）
 * - 表达终端持续对话模式所需的最小参数集合。
 * - 默认复用 `city agent quest` 相同的 Console 主会话。
 */

/**
 * `city agent chat` 命令选项。
 */
export interface AgentChatCliOptions {
  /**
   * 目标 agent 名称。
   *
   * 说明（中文）
   * - 省略时在交互式终端中从当前运行中的 agent 列表里选择。
   */
  to?: string;

  /**
   * 覆盖目标 runtime host。
   */
  host?: string;

  /**
   * 覆盖目标 runtime port。
   */
  port?: number;

  /**
   * 显式覆盖 Bearer Token。
   */
  token?: string;
}
