/**
 * `city agent chat` CLI 类型。
 *
 * 关键点（中文）
 * - 统一覆盖交互式持续对话与一次性消息两种入口。
 * - 默认使用独立的 local-cli 会话，避免与 Console UI 上下文互相污染。
 */

/**
 * `city agent chat` 默认使用的 local-cli 会话 ID。
 */
export const AGENT_CHAT_DEFAULT_SESSION_ID = "local-cli-chat-main";

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
   * 一次性发送的消息文本。
   *
   * 说明（中文）
   * - 传入后不进入 REPL，执行一轮后直接退出。
   * - 未传时进入交互式持续对话模式。
   */
  message?: string;

  /**
   * 是否输出 JSON。
   *
   * 说明（中文）
   * - 仅一次性模式使用；交互式对话不输出结构化 JSON。
   */
  json?: boolean;

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

/**
 * Dashboard execute 结果片段。
 */
export interface AgentChatExecuteResult {
  /**
   * 本轮执行是否成功。
   */
  success?: boolean;

  /**
   * 是否已经进入队列。
   */
  queued?: boolean;

  /**
   * 队列项 ID。
   */
  queueItemId?: string;

  /**
   * 当前队列位置。
   */
  queuePosition?: number;

  /**
   * 面向用户可直接阅读的回复文本。
   */
  userVisible?: string;

  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * Dashboard execute 响应体。
 */
export interface AgentChatExecuteResponse {
  /**
   * HTTP 路由层是否成功处理请求。
   */
  success: boolean;

  /**
   * 实际执行使用的 sessionId。
   */
  sessionId?: string;

  /**
   * 执行结果。
   */
  result?: AgentChatExecuteResult;

  /**
   * 顶层错误信息。
   */
  error?: string;
}

/**
 * 复用 chat transport 时的基础选项。
 */
export interface AgentChatTransportOptions {
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

/**
 * 单轮 chat 执行结果。
 */
export interface AgentChatExecutionOutcome {
  /**
   * 目标 agent 名称。
   */
  agentName: string;

  /**
   * 目标 agent 项目根目录。
   */
  projectRoot?: string;

  /**
   * 实际执行使用的 sessionId。
   */
  sessionId: string;

  /**
   * 请求是否成功。
   */
  success: boolean;

  /**
   * 执行结果响应体。
   */
  payload?: AgentChatExecuteResponse;

  /**
   * 失败时的错误文本。
   */
  error?: string;
}
