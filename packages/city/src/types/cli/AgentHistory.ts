/**
 * Agent 历史维护命令类型。
 *
 * 关键点（中文）
 * - 只描述 CLI 输入与清理结果。
 * - 具体文件删除逻辑放在 `src/cli/AgentHistory.ts`。
 */

/**
 * `city agent history clean` 命令选项。
 */
export interface AgentHistoryCleanOptions {
  /**
   * 目标 session ID。
   *
   * 说明（中文）
   * - 与 channel/chatId 二选一。
   * - 显式传入时优先级最高。
   */
  sessionId?: string;

  /**
   * 目标聊天渠道。
   *
   * 说明（中文）
   * - 用于从 `.downcity/channel/meta.json` 反查 sessionId。
   */
  channel?: string;

  /**
   * 目标渠道内 chat ID。
   *
   * 说明（中文）
   * - 与 channel 组合定位某个 Telegram/Feishu/QQ 对话。
   */
  chatId?: string;

  /**
   * 目标渠道会话类型。
   *
   * 说明（中文）
   * - 可选字段，群聊/线程场景中用于缩小匹配范围。
   */
  targetType?: string;

  /**
   * 目标线程 ID。
   *
   * 说明（中文）
   * - Telegram forum topic 等线程场景可使用。
   */
  threadId?: string;

  /**
   * 是否执行硬清理。
   *
   * 说明（中文）
   * - 必须显式为 true，命令才会删除文件。
   */
  hard?: boolean;

  /**
   * 是否以 JSON 格式输出。
   */
  json?: boolean;
}

/**
 * Agent 历史硬清理结果。
 */
export interface AgentHistoryCleanResult {
  /**
   * Agent 项目根目录。
   */
  projectRoot: string;

  /**
   * 被清理的 session ID。
   */
  sessionId: string;

  /**
   * 是否删除了 core session 目录。
   */
  removedSessionDir: boolean;

  /**
   * 是否删除了 chat 审计目录。
   */
  removedChatDir: boolean;

  /**
   * 是否删除了 channel 路由映射。
   */
  removedRoute: boolean;
}

/**
 * Channel 路由记录。
 */
export interface AgentHistoryChannelRoute {
  /**
   * 路由绑定的 session ID。
   */
  sessionId?: unknown;

  /**
   * 渠道名称，例如 telegram。
   */
  channel?: unknown;

  /**
   * 渠道内 chat ID。
   */
  chatId?: unknown;

  /**
   * 渠道会话类型，例如 private。
   */
  targetType?: unknown;

  /**
   * 渠道线程 ID，例如 Telegram forum topic ID。
   */
  threadId?: unknown;
}

/**
 * `.downcity/channel/meta.json` 文件结构。
 */
export interface AgentHistoryChannelMetaFile {
  /**
   * 路由文件最后更新时间。
   */
  updatedAt?: unknown;

  /**
   * 以 target key 索引的 session ID 映射。
   */
  sessionIdByTargetKey?: Record<string, unknown>;

  /**
   * 以 session ID 索引的渠道路由映射。
   */
  routesBySessionId?: Record<string, AgentHistoryChannelRoute>;
}
