/**
 * Downcity Console/Runtime API 类型定义。
 *
 * 关键点（中文）：
 * - 仅声明插件实际使用到的字段，避免无关类型噪音。
 * - 所有字段都保持可选，适配运行时返回的演进结构。
 */

/**
 * Console UI 中单个 Agent 选项。
 */
export interface ConsoleUiAgentOption {
  /**
   * Agent 唯一标识（当前实现为项目根目录绝对路径）。
   */
  id: string;

  /**
   * Agent 展示名称（通常来自 ship.json.name）。
   */
  name: string;

  /**
   * Agent 项目根目录。
   */
  projectRoot: string;

  /**
   * Agent 当前是否在线运行。
   */
  running: boolean;

  /**
   * Runtime 访问主机。
   */
  host?: string;

  /**
   * Runtime 访问端口。
   */
  port?: number;

  /**
   * Runtime 基础地址。
   */
  baseUrl?: string;

  /**
   * 已启动 chat 渠道身份快照（来自 Console UI）。
   */
  chatProfiles?: Array<{
    /**
     * 渠道名（telegram/feishu/qq）。
     */
    channel: "telegram" | "feishu" | "qq" | string;

    /**
     * 渠道身份展示名。
     */
    identity: string;

    /**
     * 链路状态（connected/disconnected/unknown）。
     */
    linkState?: string;

    /**
     * 运行状态文案。
     */
    statusText?: string;
  }>;
}

/**
 * `/api/ui/agents` 响应体。
 */
export interface ConsoleUiAgentsResponse {
  /**
   * 请求是否成功。
   */
  success: boolean;

  /**
   * Agent 列表。
   */
  agents: ConsoleUiAgentOption[];

  /**
   * Console 当前选中的 Agent id。
   */
  selectedAgentId: string;

  /**
   * 错误信息（失败时可能存在）。
   */
  error?: string;
}

/**
 * TUI context 摘要。
 */
export interface TuiContextSummary {
  /**
   * 上下文唯一标识。
   */
  contextId: string;

  /**
   * 消息总数。
   */
  messageCount: number;

  /**
   * 最后更新时间（毫秒时间戳）。
   */
  updatedAt?: number;

  /**
   * 最后一条消息角色。
   */
  lastRole?: "user" | "assistant" | "system";

  /**
   * 最后一条消息摘要。
   */
  lastText?: string;

  /**
   * 渠道名称（若该 context 由 chat 渠道维护）。
   */
  channel?: "telegram" | "feishu" | "qq" | "consoleui" | string;

  /**
   * 平台 chat 原始 ID（可选）。
   */
  chatId?: string;

  /**
   * 平台 chat 展示名称（例如群名、会话名、昵称）。
   */
  chatTitle?: string;

  /**
   * 平台 chat 类型（可选）。
   */
  chatType?: string;

  /**
   * 平台 thread/topic ID（可选）。
   */
  threadId?: number;
}

/**
 * `/api/tui/contexts` 响应体。
 */
export interface TuiContextsResponse {
  /**
   * 请求是否成功。
   */
  success: boolean;

  /**
   * 上下文列表。
   */
  contexts?: TuiContextSummary[];

  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * 可选 chatKey 条目。
 */
export interface ChatKeyOption {
  /**
   * 可发送的 chatKey。
   */
  chatKey: string;

  /**
   * 渠道名称。
   */
  channel: "telegram" | "feishu" | "qq";

  /**
   * 下拉主标题。
   */
  title: string;

  /**
   * 下拉副标题。
   */
  subtitle: string;

  /**
   * 该上下文消息数。
   */
  messageCount: number;

  /**
   * 最近更新时间（毫秒时间戳）。
   */
  updatedAt?: number;
}

/**
 * `/api/tui/contexts/:contextId/execute` 请求体。
 */
export type TuiContextExecuteAttachmentType =
  | "document"
  | "photo"
  | "voice"
  | "audio"
  | "video";

/**
 * execute 附件定义。
 */
export interface TuiContextExecuteAttachmentInput {
  /**
   * 附件类型（默认 `document`）。
   */
  type?: TuiContextExecuteAttachmentType;

  /**
   * 文件名（用于服务端落盘命名）。
   */
  fileName?: string;

  /**
   * 附件说明（可选）。
   */
  caption?: string;

  /**
   * 文本内容（UTF-8）。
   */
  content?: string;

  /**
   * MIME 类型（可选）。
   */
  contentType?: string;
}

/**
 * `/api/tui/contexts/:contextId/execute` 请求体。
 */
export interface TuiContextExecuteRequestBody {
  /**
   * 要执行的自然语言指令。
   */
  instructions: string;

  /**
   * 附件列表（可选）。
   */
  attachments?: TuiContextExecuteAttachmentInput[];
}

/**
 * `/api/services/command` 请求体。
 */
export interface ServiceCommandRequestBody {
  /**
   * 服务名称，例如 `chat`。
   */
  serviceName: string;

  /**
   * 服务命令名称，例如 `send`。
   */
  command: string;

  /**
   * 命令参数载荷。
   */
  payload: Record<string, unknown>;
}

/**
 * API 通用响应形态。
 */
export interface GenericApiResponse {
  /**
   * 成功标记。
   */
  success?: boolean;

  /**
   * 业务消息。
   */
  message?: string;

  /**
   * 错误信息。
   */
  error?: string;

  /**
   * 运行时返回的任意内容。
   */
  [key: string]: unknown;
}
