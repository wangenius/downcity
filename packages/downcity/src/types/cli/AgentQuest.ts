/**
 * `city agent quest` CLI 类型。
 *
 * 关键点（中文）
 * - 统一描述 CLI 侧发起 agent quest 时的参数与返回结构。
 * - 默认复用 Console 主对话 session，避免再造第二套“临时一次性会话”语义。
 */

/**
 * `city agent quest` 默认使用的 Console 会话 ID。
 *
 * 说明（中文）
 * - 对齐 Dashboard `/api/dashboard/sessions/:sessionId/execute`。
 * - 该 session 会与 Console UI 主会话共享上下文与历史。
 */
export const AGENT_QUEST_DEFAULT_SESSION_ID = "consoleui-chat-main";

/**
 * `city agent quest` 命令行选项。
 */
export interface AgentQuestCliOptions {
  /**
   * 目标 agent 名称。
   *
   * 说明（中文）
   * - 通过 console registry 解析到具体项目根目录。
   * - 匹配规则与 `city service --agent` 保持一致。
   */
  to: string;

  /**
   * 覆盖目标 runtime host。
   *
   * 说明（中文）
   * - 未提供时默认优先走本地 IPC。
   * - 仅显式传入 `host/port` 时才走远程 HTTP。
   */
  host?: string;

  /**
   * 覆盖目标 runtime port。
   *
   * 说明（中文）
   * - 与 `host` 配合时可强制直连远程 agent API。
   */
  port?: number;

  /**
   * 显式覆盖 Bearer Token。
   *
   * 说明（中文）
   * - 仅在远程 HTTP 模式下参与认证。
   */
  token?: string;

  /**
   * 是否输出 JSON。
   *
   * 说明（中文）
   * - 默认输出人类可读文本。
   * - `true` 时输出结构化 JSON，便于脚本消费。
   */
  json?: boolean;
}

/**
 * Dashboard session execute 返回中的 quest 结果片段。
 */
export interface AgentQuestExecuteResult {
  /**
   * 本轮 quest 是否成功。
   */
  success?: boolean;

  /**
   * 本轮是否已进入队列。
   *
   * 说明（中文）
   * - chat 型 session 会先排队，随后异步执行。
   * - console 主会话通常为同步直接执行。
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
 * Dashboard session execute 的响应体。
 */
export interface AgentQuestExecuteResponse {
  /**
   * HTTP 路由层是否成功处理请求。
   */
  success: boolean;

  /**
   * 实际执行使用的 sessionId。
   */
  sessionId?: string;

  /**
   * quest 执行结果。
   */
  result?: AgentQuestExecuteResult;

  /**
   * 顶层错误信息。
   */
  error?: string;
}

/**
 * 复用 agent quest transport 时的基础选项。
 */
export interface AgentQuestTransportOptions {
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
 * 复用 agent quest transport 后的标准化结果。
 */
export interface AgentQuestExecutionOutcome {
  /**
   * 目标 agent 名称。
   */
  agentName: string;

  /**
   * 目标 agent 项目根目录。
   */
  projectRoot?: string;

  /**
   * 统一使用的 sessionId。
   */
  sessionId: string;

  /**
   * 请求是否成功。
   */
  success: boolean;

  /**
   * 执行结果响应体。
   */
  payload?: AgentQuestExecuteResponse;

  /**
   * 失败时的错误文本。
   */
  error?: string;
}
