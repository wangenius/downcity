/**
 * Console UI Dashboard 类型定义。
 *
 * 关键点（中文）
 * - 仅声明 UI 真正依赖的字段，避免对后端响应结构过度耦合。
 * - 所有字段默认可选，保证旧版本 runtime 下可降级渲染。
 */

/**
 * Agent 选项（来自 `/api/ui/agents`）。
 */
export interface UiAgentOption {
  /**
   * Agent 唯一标识（通常为 projectRoot）。
   */
  id: string;
  /**
   * Agent 展示名（ship.json.name 或目录名）。
   */
  name: string;
  /**
   * Agent 运行主机地址。
   */
  host?: string;
  /**
   * Agent 运行端口。
   */
  port?: number;
  /**
   * Agent daemon 进程号。
   */
  daemonPid?: number;
}

/**
 * `/api/ui/agents` 响应。
 */
export interface UiAgentsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前可选 agent 列表。
   */
  agents?: UiAgentOption[];
  /**
   * 当前被后端选中的 agent id。
   */
  selectedAgentId?: string;
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * 附加消息。
   */
  message?: string;
}

/**
 * Context 概览项。
 */
export interface UiOverviewContextItem {
  /**
   * Context 唯一标识。
   */
  contextId?: string;
}

/**
 * TUI context 摘要项。
 */
export interface UiContextSummary {
  /**
   * context 唯一标识。
   */
  contextId: string;
  /**
   * 消息总数。
   */
  messageCount?: number;
  /**
   * 最近更新时间戳。
   */
  updatedAt?: number;
  /**
   * 最后一条消息角色。
   */
  lastRole?: string;
  /**
   * 最后一条消息摘要。
   */
  lastText?: string;
}

/**
 * `/api/tui/contexts` 响应。
 */
export interface UiContextsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * context 列表。
   */
  contexts?: UiContextSummary[];
}

/**
 * `/api/tui/overview` 响应。
 */
export interface UiOverviewResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前 agent 基础信息。
   */
  agent?: {
    /**
     * agent 展示名。
     */
    name?: string;
  };
  /**
   * 上下文统计信息。
   */
  contexts?: {
    /**
     * context 总数。
     */
    total?: number;
    /**
     * context 列表。
     */
    items?: UiOverviewContextItem[];
  };
  /**
   * 任务统计信息。
   */
  tasks?: {
    /**
     * task 总数。
     */
    total?: number;
    /**
     * task 状态计数。
     */
    statusCount?: {
      /**
       * enabled 数量。
       */
      enabled?: number;
      /**
       * paused 数量。
       */
      paused?: number;
      /**
       * disabled 数量。
       */
      disabled?: number;
    };
  };
}

/**
 * Service 状态项。
 */
export interface UiServiceItem {
  /**
   * Service 名称（新字段）。
   */
  name?: string;
  /**
   * Service 名称（兼容字段）。
   */
  service?: string;
  /**
   * Service 状态（新字段）。
   */
  state?: string;
  /**
   * Service 状态（兼容字段）。
   */
  status?: string;
}

/**
 * `/api/tui/services` 响应。
 */
export interface UiServicesResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * service 列表。
   */
  services?: UiServiceItem[];
}

/**
 * Extension 运行时快照。
 */
export interface UiExtensionRuntimeItem {
  /**
   * extension 名称。
   */
  name?: string;
  /**
   * extension 运行状态。
   */
  state?: string;
  /**
   * 最近更新时间戳。
   */
  updatedAt?: number;
  /**
   * 最近错误信息。
   */
  lastError?: string;
  /**
   * 最近命令名。
   */
  lastCommand?: string;
  /**
   * 最近命令时间戳。
   */
  lastCommandAt?: number;
  /**
   * 是否支持 lifecycle 控制。
   */
  supportsLifecycle?: boolean;
  /**
   * 是否支持 command 调用。
   */
  supportsCommand?: boolean;
}

/**
 * `/api/extensions/list` 响应。
 */
export interface UiExtensionsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * extension 列表。
   */
  extensions?: UiExtensionRuntimeItem[];
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * 附加消息。
   */
  message?: string;
}

/**
 * Chat 渠道运行状态项。
 */
export interface UiChatChannelStatus {
  /**
   * 渠道名称，例如 qq/telegram。
   */
  channel?: string;
  /**
   * 链接状态文本。
   */
  linkState?: string;
  /**
   * 运行状态文本。
   */
  statusText?: string;
  /**
   * 渠道进程是否运行中。
   */
  running?: boolean;
  /**
   * 渠道是否启用。
   */
  enabled?: boolean;
  /**
   * 渠道是否已配置。
   */
  configured?: boolean;
}

/**
 * `/api/services/command` chat.status 响应。
 */
export interface UiChatStatusResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 业务数据载荷。
   */
  data?: {
    /**
     * 渠道状态列表。
     */
    channels?: UiChatChannelStatus[];
    /**
     * 渠道测试结果列表。
     */
    results?: UiChatActionResult[];
    /**
     * history 事件列表（chat.history）。
     */
    events?: UiChatHistoryEvent[];
    /**
     * history 事件数量。
     */
    count?: number;
    /**
     * history 文件路径。
     */
    historyPath?: string;
  };
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * 附加消息。
   */
  message?: string;
}

/**
 * chat test/reconnect 动作结果。
 */
export interface UiChatActionResult {
  /**
   * 渠道名。
   */
  channel?: string;
  /**
   * 是否执行成功。
   */
  success?: boolean;
  /**
   * 动作反馈信息。
   */
  message?: string;
}

/**
 * 任务状态项。
 */
export interface UiTaskItem {
  /**
   * 任务 id（主字段）。
   */
  taskId?: string;
  /**
   * 任务 id（兼容字段）。
   */
  id?: string;
  /**
   * 任务状态。
   */
  status?: string;
  /**
   * cron 表达式。
   */
  cron?: string;
}

/**
 * `/api/tui/tasks` 响应。
 */
export interface UiTasksResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * task 列表。
   */
  tasks?: UiTaskItem[];
}

/**
 * 日志项。
 */
export interface UiLogItem {
  /**
   * 日志时间戳（number 或 string）。
   */
  timestamp?: number | string;
  /**
   * 日志类型（兼容字段）。
   */
  type?: string;
  /**
   * 日志级别（兼容字段）。
   */
  level?: string;
  /**
   * 日志消息。
   */
  message?: string;
}

/**
 * `/api/tui/logs` 响应。
 */
export interface UiLogsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 日志列表。
   */
  logs?: UiLogItem[];
}

/**
 * Prompt section item。
 */
export interface UiPromptSectionItem {
  /**
   * 消息索引。
   */
  index?: number;
  /**
   * 消息内容。
   */
  content?: string;
}

/**
 * Prompt section。
 */
export interface UiPromptSection {
  /**
   * section 标题。
   */
  title?: string;
  /**
   * section key。
   */
  key?: string;
  /**
   * section 下的消息项。
   */
  items?: UiPromptSectionItem[];
}

/**
 * `/api/tui/system-prompt` 响应。
 */
export interface UiPromptResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 当前 context id。
   */
  contextId?: string;
  /**
   * 消息总数。
   */
  totalMessages?: number;
  /**
   * 字符总数。
   */
  totalChars?: number;
  /**
   * 分段列表。
   */
  sections?: UiPromptSection[];
}

/**
 * local_ui 消息项。
 */
export interface UiLocalMessage {
  /**
   * 角色。
   */
  role?: string;
  /**
   * 文本内容。
   */
  text?: string;
  /**
   * 时间戳。
   */
  ts?: number | string;
}

/**
 * context 时间线消息项（来自 `/api/tui/contexts/:id/messages`）。
 */
export interface UiContextTimelineMessage {
  /**
   * 消息 id。
   */
  id?: string;
  /**
   * 消息角色。
   */
  role?: string;
  /**
   * 消息时间戳。
   */
  ts?: number | string;
  /**
   * 消息文本。
   */
  text?: string;
  /**
   * 消息类型。
   */
  kind?: string;
  /**
   * 消息来源。
   */
  source?: string;
  /**
   * tool 名称。
   */
  toolName?: string;
}

/**
 * `/api/tui/contexts/:id/messages` 响应。
 */
export interface UiContextMessagesResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * context id。
   */
  contextId?: string;
  /**
   * 时间线消息列表。
   */
  messages?: UiContextTimelineMessage[];
}

/**
 * chat history 事件项（来自 chat.history）。
 */
export interface UiChatHistoryEvent {
  /**
   * 事件 id。
   */
  id?: string;
  /**
   * 事件方向。
   */
  direction?: "inbound" | "outbound" | string;
  /**
   * 事件时间戳。
   */
  ts?: number;
  /**
   * 渠道名。
   */
  channel?: string;
  /**
   * 文本内容。
   */
  text?: string;
  /**
   * context id。
   */
  contextId?: string;
  /**
   * 便于展示的 ISO 时间。
   */
  isoTime?: string;
}

/**
 * `/api/tui/contexts/:id/messages` 响应。
 */
export interface UiLocalMessagesResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 消息列表。
   */
  messages?: UiLocalMessage[];
}
